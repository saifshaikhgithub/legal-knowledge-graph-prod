"""
LLM layer. Talks to any OpenAI-compatible endpoint (NVIDIA NIM by default), so the same
code runs against the hosted free tier today and a self-hosted, air-gapped NIM later.
"""
import asyncio
import base64
import json
import re
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from openai import (APIConnectionError, APITimeoutError, AsyncOpenAI, BadRequestError,
                    InternalServerError, RateLimitError)

import config

EXTRACTION_PROMPT = """You are a forensic intelligence analyst building a knowledge graph for a criminal investigation.
Extract every investigatively relevant entity, relationship and timeline event from the text.

Return ONLY a JSON object with exactly this shape:
{
  "entities": [
    {"name": "Full canonical name", "type": "Person|Location|Object|Event|Organization|Vehicle|Weapon|Communication",
     "aliases": ["other names used in the text"], "description": "one line: who/what this is in the case",
     "attributes": {"role": "victim|suspect|witness|officer|...", "age": "...", "...": "..."}}
  ],
  "relations": [
    {"source": "entity name", "target": "entity name", "relation_type": "snake_case_verb e.g. seen_at, owns, called, argued_with, employed_by",
     "evidence": "short verbatim quote or paraphrase supporting it", "confidence": 0.0-1.0, "time": "when, if stated"}
  ],
  "timeline": [
    {"time": "human readable time as stated", "sort_key": "ISO 8601 if the date/time is determinable, else empty string",
     "description": "what happened", "entities": ["entity names involved"]}
  ]
}

Rules:
- Use the most complete name for each entity. Put nicknames and partial names in "aliases".
- Only extract what the text supports. Never invent people, places or times.
- confidence: 1.0 = directly stated, 0.6 = strongly implied, 0.3 = speculative.
- A relationship's direction matters: source does the action to target.
- If nothing relevant exists, return empty arrays.
{existing}"""

ANALYST_PROMPT = """You are SENTINEL, a senior homicide and major-crimes analyst assisting a law-enforcement investigator.
You reason like an experienced detective: methodical, skeptical, precise.

Ground every claim in the case file below. Clearly separate:
- FACT (in the case file, cite it),
- INFERENCE (your reasoning, state confidence),
- UNKNOWN (what must be verified).

Never fabricate evidence, names or times. Presume innocence: say "person of interest", not "the killer",
unless evidence is conclusive. Do not draw conclusions from race, religion, ethnicity, gender or other protected traits.

Answer the investigator's latest message directly. When it adds information or asks for analysis, use these sections
(skip any that do not apply, keep it tight):
## Assessment
## Key Connections
## Contradictions & Red Flags
## Leads (ranked by priority)
## Next Investigative Steps
For simple questions, just answer concisely. Use markdown, bold the names of entities.

=== CASE FILE: {title} ===
{description}
{graph}
=== END CASE FILE ==="""

BRIEF_PROMPT = """You are a senior major-crimes analyst writing an intelligence brief for the lead investigator.
Use ONLY the case file. Be rigorous and honest about uncertainty; presumption of innocence applies.

Return ONLY a JSON object:
{
  "headline": "one-sentence case status",
  "summary": "4-6 sentence executive summary",
  "persons_of_interest": [
    {"name": "...", "role": "suspect|witness|victim|associate", "suspicion_score": 0-100,
     "motive": "...", "means": "...", "opportunity": "...", "alibi": "... or 'none stated'",
     "key_evidence": ["..."], "reasoning": "why this score"}
  ],
  "hypotheses": [
    {"theory": "...", "likelihood": 0-100, "supporting": ["..."], "against": ["..."]}
  ],
  "contradictions": [{"description": "...", "entities": ["..."], "severity": "low|medium|high"}],
  "evidence_gaps": ["..."],
  "leads": [{"lead": "...", "priority": "high|medium|low", "rationale": "..."}],
  "next_steps": ["concrete action, e.g. 'Obtain CCTV from X between 21:00-23:00'"]
}
Order persons_of_interest by suspicion_score descending. Victims get suspicion_score 0.

=== CASE FILE: {title} ===
{description}
{graph}

RECENT INVESTIGATION NOTES:
{notes}
=== END CASE FILE ==="""

IMAGE_PROMPT = """You are a forensic examiner. Describe this evidence image for a case file named "{filename}".
Report objectively: scene/setting, people (clothing, actions - no identity guesses), vehicles (make/colour/plate if legible),
objects of note, any visible text, timestamps or signage, signs of struggle, injuries or damage.
Then list anything an investigator should follow up. Plain text, no speculation beyond what is visible."""

# Provider-side trouble worth retrying on a backup model (free endpoints get overloaded).
_TRANSIENT = (InternalServerError, RateLimitError, APITimeoutError, APIConnectionError)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_CHUNK_CHARS = 12000
_MAX_CHUNKS = 6


def _fill(template: str, **values: str) -> str:
    """str.format without tripping over the literal JSON braces in the prompts."""
    for key, value in values.items():
        template = template.replace("{" + key + "}", value)
    return template


def _thinking(enabled: bool) -> Dict[str, Any]:
    """
    Reasoning models (Nemotron, DeepSeek, Qwen...) think by default. Left on for JSON tasks they can
    spend the whole token budget thinking and return empty content, so structured calls turn it off.
    Both template flags are sent because model families name it differently; unknown ones are ignored.
    """
    return {"chat_template_kwargs": {"enable_thinking": enabled, "thinking": enabled}}


def _strip_reasoning(text: str) -> str:
    text = _THINK_RE.sub("", text or "")
    # An unterminated <think> (truncated output) - keep whatever follows the last close tag, else drop it.
    if "<think>" in text.lower():
        text = text[: text.lower().index("<think>")]
    return text.strip()


def _parse_json(text: str) -> Optional[Dict[str, Any]]:
    text = _strip_reasoning(text)
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text)
    if fenced:
        text = fenced.group(1)
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None


def _chunks(text: str) -> List[str]:
    if len(text) <= _CHUNK_CHARS:
        return [text]
    parts, current = [], ""
    for para in re.split(r"\n\s*\n", text):
        if len(current) + len(para) > _CHUNK_CHARS and current:
            parts.append(current)
            current = ""
        current += para + "\n\n"
        while len(current) > _CHUNK_CHARS:
            parts.append(current[:_CHUNK_CHARS])
            current = current[_CHUNK_CHARS:]
    if current.strip():
        parts.append(current)
    return parts[:_MAX_CHUNKS]


def _normalize_brief(brief: Dict[str, Any], victims: List[str],
                     known_roles: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Enforce what the prompt asks for but a model can still get wrong. The evidence graph decides
    who the victim is: the victim is never scored as a suspect, someone the model mislabels as the
    victim gets their evidence role back, and a victim the model left out is listed. Scores are
    clamped to 0-100 integers and people are ordered by suspicion.
    """
    victim_keys = {v.strip().lower() for v in victims if v}
    roles = {k.strip().lower(): v for k, v in (known_roles or {}).items()}
    people = [p for p in brief.get("persons_of_interest") or [] if isinstance(p, dict) and p.get("name")]
    for p in people:
        role = str(p.get("role") or "").lower()
        # Exact names only: a partial match would wrongly hit relatives who share the victim's surname.
        name = str(p["name"]).strip().lower()
        claims_victim = "victim" in role or "deceased" in role
        if name in victim_keys or (claims_victim and not victim_keys):
            p["role"] = "victim"
            p["suspicion_score"] = 0
        elif claims_victim:
            p["role"] = roles.get(name) or "person of interest"  # evidence names someone else as the victim
        try:
            p["suspicion_score"] = max(0, min(100, int(round(float(p.get("suspicion_score") or 0)))))
        except (TypeError, ValueError):
            p["suspicion_score"] = 0
    listed = {str(p["name"]).strip().lower() for p in people}
    for victim in victims:
        if victim.strip().lower() not in listed:
            people.append({"name": victim, "role": "victim", "suspicion_score": 0,
                           "reasoning": "Identified as the victim in the case evidence."})
    people.sort(key=lambda p: (p["role"] == "victim", -p["suspicion_score"]))
    brief["persons_of_interest"] = people
    return brief


class CrimeAnalyst:
    def __init__(self):
        self.client: Optional[AsyncOpenAI] = None
        if config.LLM_API_KEY:
            self.client = AsyncOpenAI(base_url=config.LLM_BASE_URL, api_key=config.LLM_API_KEY,
                                      timeout=config.LLM_TIMEOUT_SECONDS, max_retries=1)
        else:
            print("[WARN] NVIDIA_API_KEY not set - AI features run in offline mode.")

    @property
    def ready(self) -> bool:
        return self.client is not None

    async def _complete(self, models: List[str], messages: List[Dict], *, max_tokens: int,
                        temperature: float = 0.2, json_mode: bool = False, thinking: bool = False,
                        timeout: Optional[float] = None) -> str:
        """
        One completion. Tries each model in order: a model that is overloaded or rejects the request
        hands over to the next, and each model degrades gracefully if it lacks JSON mode / thinking flags.
        """
        last_error: Optional[Exception] = None
        for model in dict.fromkeys(m for m in models if m):
            base: Dict[str, Any] = dict(model=model, messages=messages, max_tokens=max_tokens, temperature=temperature,
                                        top_p=0.9, timeout=timeout or config.LLM_TIMEOUT_SECONDS)
            attempts = []
            if json_mode:
                attempts.append({"response_format": {"type": "json_object"}, "extra_body": _thinking(thinking)})
            attempts += [{"extra_body": _thinking(thinking)}, {}]
            for extra in attempts:
                try:
                    resp = await self.client.chat.completions.create(**base, **extra)
                    return resp.choices[0].message.content or ""
                except BadRequestError as e:  # unsupported option or input - plainer request, then next model
                    last_error = e
                except _TRANSIENT as e:
                    print(f"[WARN] {model} unavailable ({type(e).__name__}) - trying backup model")
                    last_error = e
                    break
        raise last_error  # type: ignore[misc]

    # -------------------------------------------------------------- extraction

    async def extract_entities(self, text: str, existing_entities: Optional[List[str]] = None) -> Dict[str, Any]:
        result: Dict[str, Any] = {"entities": [], "relations": [], "timeline": []}
        if not self.ready or not text.strip():
            return result

        known = list(existing_entities or [])
        for chunk in _chunks(text):
            existing = ""
            if known:
                existing = ("\nEntities ALREADY in the case graph - when the text refers to one of them, reuse the EXACT name:\n"
                            + ", ".join(known[:300]))
            messages = [
                {"role": "system", "content": EXTRACTION_PROMPT.replace("{existing}", existing)},
                {"role": "user", "content": f"TEXT:\n{chunk}"},
            ]
            try:
                raw = await self._complete([config.EXTRACTION_MODEL, config.EXTRACTION_FALLBACK_MODEL], messages,
                                           max_tokens=6000, temperature=0.1, json_mode=True, timeout=120)
            except Exception as e:  # network / provider errors must not kill the chat turn
                print(f"[ERROR] extraction failed: {type(e).__name__}: {e}")
                continue
            parsed = _parse_json(raw) or {}
            for key in result:
                items = parsed.get(key)
                if isinstance(items, list):
                    result[key].extend(items)
            known.extend(e.get("name") for e in parsed.get("entities", []) if isinstance(e, dict) and e.get("name"))
        return result

    # ---------------------------------------------------------------- analysis

    async def stream_analysis(self, *, title: str, description: str, graph_summary: str,
                              history: List[Dict[str, str]], message: str) -> AsyncIterator[Tuple[str, str]]:
        """
        Yields ("reasoning", text) for the model's thinking trace and ("token", text) for the answer.
        Handles both reasoning_content deltas and inline <think> tags.
        """
        if not self.ready:
            yield ("token", "**Offline mode.** No `NVIDIA_API_KEY` is configured on the server, so I can't analyse yet. "
                            "Your message and evidence were saved - add the key and ask again.")
            return

        system = _fill(ANALYST_PROMPT, title=title, description=description or "", graph=graph_summary)
        messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": message}]

        models = list(dict.fromkeys([config.REASONING_MODEL, config.REASONING_FALLBACK_MODEL]))
        for model in models:
            request = dict(model=model, messages=messages, max_tokens=16384, temperature=0.4, top_p=0.95, stream=True)
            try:
                try:
                    stream = await self.client.chat.completions.create(**request, extra_body=_thinking(config.ANALYST_THINKING))
                except BadRequestError:
                    stream = await self.client.chat.completions.create(**request)
                break
            except _TRANSIENT as e:
                print(f"[WARN] {model} unavailable ({type(e).__name__}) - trying backup model")
                if model == models[-1]:
                    raise
        in_think = False
        buffer = ""
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
            if reasoning:
                yield ("reasoning", reasoning)
            content = delta.content or ""
            if not content:
                continue
            buffer += content
            # Route inline <think>...</think> to the reasoning channel.
            while buffer:
                if in_think:
                    end = buffer.lower().find("</think>")
                    if end == -1:
                        safe = max(0, len(buffer) - 8)
                        if safe:
                            yield ("reasoning", buffer[:safe])
                        buffer = buffer[safe:]
                        break
                    if end:
                        yield ("reasoning", buffer[:end])
                    buffer = buffer[end + len("</think>"):]
                    in_think = False
                else:
                    start = buffer.lower().find("<think>")
                    if start == -1:
                        safe = max(0, len(buffer) - 7)  # keep a possible partial "<think" tag
                        if safe:
                            yield ("token", buffer[:safe])
                        buffer = buffer[safe:]
                        break
                    if start:
                        yield ("token", buffer[:start])
                    buffer = buffer[start + len("<think>"):]
                    in_think = True
        if buffer:
            yield ("reasoning" if in_think else "token", buffer)

    # ------------------------------------------------------------------- brief

    async def generate_brief(self, *, title: str, description: str, graph_summary: str, notes: str,
                             victims: Optional[List[str]] = None,
                             known_roles: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        if not self.ready:
            raise RuntimeError("AI is offline: NVIDIA_API_KEY is not configured on the server.")
        prompt = _fill(BRIEF_PROMPT, title=title, description=description or "", graph=graph_summary, notes=notes)
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Write the complete intelligence brief now - every field. JSON only."},
        ]
        # Models occasionally return a truncated object (e.g. only a headline). Never save that:
        # retry once, then fall back to the backup model.
        brief: Optional[Dict[str, Any]] = None
        for model in [config.REASONING_MODEL, config.REASONING_MODEL, config.REASONING_FALLBACK_MODEL]:
            try:
                raw = await self._complete([model], messages, max_tokens=8192, temperature=0.2, json_mode=True, timeout=180)
            except _TRANSIENT as e:
                print(f"[WARN] brief: {model} unavailable ({type(e).__name__})")
                continue
            candidate = _parse_json(raw)
            if isinstance(candidate, dict) and candidate.get("summary") and candidate.get("persons_of_interest"):
                brief = candidate
                break
            print(f"[WARN] brief from {model} was incomplete - retrying")
        if not brief:
            raise RuntimeError("The model returned an incomplete brief. Please try again in a moment.")
        return _normalize_brief(brief, victims or [], known_roles)

    # ------------------------------------------------------------------ vision

    async def describe_image(self, data: bytes, mime: str, filename: str) -> str:
        if not self.ready:
            return f"[Image '{filename}' stored. AI vision is offline - no NVIDIA_API_KEY configured.]"
        b64 = base64.b64encode(data).decode("ascii")
        messages = [{"role": "user", "content": [
            {"type": "text", "text": _fill(IMAGE_PROMPT, filename=filename)},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
        ]}]
        error: Optional[Exception] = None
        for attempt in range(3):  # the free vision endpoint is often briefly saturated; a short wait usually clears it
            try:
                return _strip_reasoning(await self._complete([config.VISION_MODEL, config.VISION_FALLBACK_MODEL], messages,
                                                             max_tokens=2048, timeout=60))
            except _TRANSIENT as e:
                error = e
                await asyncio.sleep(3 * (attempt + 1))
            except Exception as e:
                error = e
                break
        print(f"[ERROR] vision failed: {type(error).__name__}: {error}")
        return f"[Image '{filename}' stored, but automatic analysis failed: {type(error).__name__}. Try uploading it again.]"
