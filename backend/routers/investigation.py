"""
Investigation workflow for a case: streaming analyst chat, evidence intake,
knowledge graph, timeline, AI brief and exportable report.
"""
import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import audit
import billing
import config
from auth import get_current_user
from database import async_session_maker, get_db
from models import Case, Evidence, Message, User
from modules.files import DOCUMENT_EXTENSIONS, IMAGE_TYPES, extension, extract_document_text
from modules.graph_manager import CrimeGraph, ENTITY_TYPES
from modules.llm_engine import CrimeAnalyst, _normalize_brief
from routers.common import get_owned_case, iso, load_graph, save_graph

router = APIRouter(prefix="/api/cases/{case_id}", tags=["investigation"])

analyst = CrimeAnalyst()
_chat_limiter = audit.RateLimiter(limit=config.CHAT_RATE_LIMIT_PER_MIN)

HISTORY_MESSAGES = 12
HISTORY_CHARS = 4000
EVIDENCE_CONTEXT_CHARS = 24000


# ------------------------------------------------------------------ schemas

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    evidence_ids: List[int] = []


class EvidenceResponse(BaseModel):
    id: int
    filename: str
    kind: str
    char_count: int
    sha256: str
    preview: str
    created_at: str


class MergeRequest(BaseModel):
    keep: str
    merge: str


class LayoutUpdate(BaseModel):
    # node id -> [x, y]; null removes a saved position
    positions: Dict[str, Optional[List[float]]]
    camera: Optional[Dict[str, float]] = None  # {"x", "y", "k"}: pan centre and zoom


class EntityUpdate(BaseModel):
    type: Optional[str] = None
    description: Optional[str] = None


def _evidence_response(ev: Evidence) -> EvidenceResponse:
    return EvidenceResponse(id=ev.id, filename=ev.filename, kind=ev.kind, char_count=ev.char_count,
                            sha256=ev.sha256, preview=ev.content_text[:400], created_at=iso(ev.created_at))


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"


def _public_error(e: Exception) -> str:
    return f"{type(e).__name__}: {e}" if config.DEBUG_ERRORS else "The AI service failed to respond. Please try again."


# --------------------------------------------------------------------- chat

@router.post("/chat")
async def chat(case_id: int, body: ChatRequest, current_user: User = Depends(get_current_user),
               db: AsyncSession = Depends(get_db)):
    """
    Server-sent events stream:
      {"type":"status","stage":"extracting"|"analyzing"}
      {"type":"graph","stats":{...},"changes":{...}}
      {"type":"reasoning","text":...}   model thinking trace
      {"type":"token","text":...}       answer text
      {"type":"done","message_id":..} | {"type":"error","message":...}
    """
    _chat_limiter.check(f"chat:{current_user.id}")
    await get_owned_case(db, case_id, current_user)  # authorize before streaming starts
    await billing.consume(db, current_user, "messages")
    await db.commit()
    user_id = current_user.id

    async def stream():
        # The request-scoped session may already be closed while streaming, so use our own.
        async with async_session_maker() as session:
            case = await session.get(Case, case_id)
            history_rows = (await session.execute(
                select(Message).where(Message.case_id == case_id).order_by(Message.id.desc()).limit(HISTORY_MESSAGES)
            )).scalars().all()
            history = [{"role": m.role, "content": m.content[:HISTORY_CHARS]} for m in reversed(history_rows)]

            evidence_text = ""
            if body.evidence_ids:
                evidence = (await session.execute(
                    select(Evidence).where(Evidence.case_id == case_id, Evidence.id.in_(body.evidence_ids))
                )).scalars().all()
                for ev in evidence:
                    evidence_text += f"\n\n--- EVIDENCE: {ev.filename} ({ev.kind}) ---\n{ev.content_text}"
                evidence_text = evidence_text[:EVIDENCE_CONTEXT_CHARS]

            user_msg = Message(case_id=case_id, role="user", content=body.message)
            session.add(user_msg)
            await session.commit()

            # Graph extraction runs alongside the analyst so the answer starts streaming immediately;
            # the analyst already sees the new message, so it never waits on the graph update.
            graph = load_graph(case)
            extraction = asyncio.create_task(analyst.extract_entities(body.message, graph.get_all_entities()))
            graph_summary = graph.summary_for_llm()
            graph_sent = False

            async def apply_graph() -> str:
                nonlocal graph_sent
                graph_sent = True
                try:
                    changes = graph.apply_extraction(await extraction, source=f"message:{user_msg.id}")
                except Exception as e:
                    print(f"[ERROR] extraction: {type(e).__name__}: {e}")
                    return ""
                save_graph(case, graph)
                case.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
                await session.commit()
                return _sse({"type": "graph", "stats": graph.stats(), "changes": changes})

            yield _sse({"type": "status", "stage": "analyzing"})
            prompt = body.message + (f"\n\nATTACHED EVIDENCE:{evidence_text}" if evidence_text else "")
            answer = ""
            try:
                async for kind, text in analyst.stream_analysis(
                    title=case.title, description=case.description or "",
                    graph_summary=graph_summary, history=history, message=prompt,
                ):
                    if kind == "token":
                        answer += text
                    yield _sse({"type": kind, "text": text})
                    if not graph_sent and extraction.done():
                        if event := await apply_graph():
                            yield event
            except Exception as e:
                print(f"[ERROR] analysis stream: {type(e).__name__}: {e}")
                yield _sse({"type": "error", "message": _public_error(e)})

            if not graph_sent:
                yield _sse({"type": "status", "stage": "extracting"})
                if event := await apply_graph():
                    yield event

            if answer.strip():
                reply = Message(case_id=case_id, role="assistant", content=answer.strip())
                session.add(reply)
                audit.record(session, "case.chat", user_id=user_id, case_id=case_id, detail=body.message[:300])
                await session.commit()
                yield _sse({"type": "done", "message_id": reply.id, "user_message_id": user_msg.id})
            else:
                yield _sse({"type": "done", "message_id": None, "user_message_id": user_msg.id})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# -------------------------------------------------------------------- graph

@router.get("/graph")
async def get_graph(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    graph = load_graph(case)
    nodes, edges = graph.get_data_for_visualization()
    return {"nodes": nodes, "edges": edges, "stats": graph.stats(), "entity_types": ENTITY_TYPES,
            "layout": _load_layout(case)}


def _load_layout(case: Case) -> dict:
    try:
        layout = json.loads(case.layout_json or "{}")
    except json.JSONDecodeError:
        layout = {}
    return {"positions": layout.get("positions", {}), "camera": layout.get("camera")}


MAX_LAYOUT_NODES = 5000


@router.put("/graph/layout")
async def save_layout(case_id: int, body: LayoutUpdate, current_user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    """Remember where the investigator arranged the evidence board (merged, not replaced)."""
    case = await get_owned_case(db, case_id, current_user)
    layout = _load_layout(case)
    positions = layout["positions"]
    for node_id, pos in body.positions.items():
        if pos is None:
            positions.pop(node_id, None)
        elif len(pos) == 2 and all(isinstance(v, (int, float)) and abs(v) < 1e6 for v in pos):
            positions[node_id] = [round(pos[0], 1), round(pos[1], 1)]
    if len(positions) > MAX_LAYOUT_NODES:
        raise HTTPException(status_code=413, detail="Layout too large")
    if body.camera:
        layout["camera"] = {k: float(v) for k, v in body.camera.items() if k in ("x", "y", "k")}
    case.layout_json = json.dumps(layout)
    await db.commit()
    return {"ok": True, "saved": len(positions)}


@router.get("/timeline")
async def get_timeline(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    return load_graph(case).get_timeline()


@router.post("/graph/merge")
async def merge_entities(case_id: int, body: MergeRequest, current_user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Investigator correction: two nodes are the same real-world entity."""
    case = await get_owned_case(db, case_id, current_user)
    graph = load_graph(case)
    if not graph.merge_entities(body.keep, body.merge):
        raise HTTPException(status_code=400, detail="Both entities must exist and be different")
    save_graph(case, graph)
    audit.record(db, "graph.merge", user_id=current_user.id, case_id=case.id, detail=f"{body.merge} -> {body.keep}")
    await db.commit()
    return {"ok": True}


@router.patch("/graph/entities/{name:path}")
async def update_entity(case_id: int, name: str, body: EntityUpdate, current_user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    graph = load_graph(case)
    if name not in graph.graph:
        raise HTTPException(status_code=404, detail="Entity not found")
    if body.type:
        graph.graph.nodes[name]["type"] = body.type
    if body.description is not None:
        graph.graph.nodes[name]["description"] = body.description
    save_graph(case, graph)
    audit.record(db, "graph.edit", user_id=current_user.id, case_id=case.id, detail=name)
    await db.commit()
    return {"ok": True}


@router.delete("/graph/entities/{name:path}")
async def delete_entity(case_id: int, name: str, current_user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    graph = load_graph(case)
    if name not in graph.graph:
        raise HTTPException(status_code=404, detail="Entity not found")
    graph.graph.remove_node(name)
    save_graph(case, graph)
    audit.record(db, "graph.delete_entity", user_id=current_user.id, case_id=case.id, detail=name)
    await db.commit()
    return {"ok": True}


@router.post("/clear")
async def clear_graph(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    save_graph(case, CrimeGraph())
    case.brief_json = None
    case.brief_generated_at = None
    case.layout_json = None
    audit.record(db, "graph.clear", user_id=current_user.id, case_id=case.id)
    await db.commit()
    return {"success": True, "message": "Knowledge graph cleared"}


# ----------------------------------------------------------------- evidence

@router.get("/evidence", response_model=List[EvidenceResponse])
async def list_evidence(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    rows = (await db.execute(select(Evidence).where(Evidence.case_id == case.id).order_by(Evidence.id.desc()))).scalars().all()
    return [_evidence_response(e) for e in rows]


@router.get("/evidence/{evidence_id}")
async def get_evidence(case_id: int, evidence_id: int, current_user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    ev = (await db.execute(select(Evidence).where(Evidence.id == evidence_id, Evidence.case_id == case.id))).scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return {**_evidence_response(ev).model_dump(), "content": ev.content_text}


@router.post("/evidence")
async def upload_evidence(case_id: int, file: UploadFile = File(...), current_user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    """Store an evidence file, extract its text (or describe an image) and grow the graph from it."""
    case = await get_owned_case(db, case_id, current_user)
    _chat_limiter.check(f"chat:{current_user.id}")

    data = await file.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File larger than {config.MAX_UPLOAD_MB} MB")
    await billing.consume(db, current_user, "uploads")  # committed with the evidence, so failed uploads are free
    filename = (file.filename or "evidence").replace("\\", "/").split("/")[-1][:255]
    ext = extension(filename)

    if ext in IMAGE_TYPES:
        kind = "image"
        content = await analyst.describe_image(data, IMAGE_TYPES[ext], filename)
    elif ext in DOCUMENT_EXTENSIONS:
        kind = "document"
        try:
            content = extract_document_text(filename, data)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not read {filename}: {type(e).__name__}")
        if not content.strip():
            raise HTTPException(status_code=422, detail="No readable text found (scanned PDFs need OCR)")
    else:
        raise HTTPException(status_code=415, detail="Supported: PDF, DOCX, TXT/MD/CSV/LOG/JSON, JPG, PNG, WEBP")

    evidence = Evidence(case_id=case.id, filename=filename, kind=kind, content_text=content,
                        char_count=len(content), sha256=hashlib.sha256(data).hexdigest(),
                        uploaded_by=current_user.id)
    db.add(evidence)
    await db.flush()

    graph = load_graph(case)
    extraction = await analyst.extract_entities(f"Evidence file '{filename}':\n{content}", graph.get_all_entities())
    changes = graph.apply_extraction(extraction, source=f"evidence:{evidence.id}")
    save_graph(case, graph)
    case.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    audit.record(db, "evidence.upload", user_id=current_user.id, case_id=case.id,
                 detail=f"{filename} sha256={evidence.sha256}")
    await db.commit()
    await db.refresh(evidence)
    return {"evidence": _evidence_response(evidence), "changes": changes, "stats": graph.stats()}


# -------------------------------------------------------------------- brief

@router.get("/brief")
async def get_brief(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    if not case.brief_json:
        return {"brief": None, "generated_at": None}
    # Re-check roles against the current evidence, so briefs saved earlier are corrected too.
    graph = load_graph(case)
    brief = _normalize_brief(json.loads(case.brief_json), graph.victims(), graph.person_roles())
    return {"brief": brief, "generated_at": iso(case.brief_generated_at)}


@router.post("/brief")
async def generate_brief(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    _chat_limiter.check(f"chat:{current_user.id}")
    graph = load_graph(case)
    if graph.graph.number_of_nodes() == 0:
        raise HTTPException(status_code=400, detail="Add case information first - the graph is empty")
    await billing.consume(db, current_user, "briefs")

    recent = (await db.execute(
        select(Message).where(Message.case_id == case.id, Message.role == "user").order_by(Message.id.desc()).limit(20)
    )).scalars().all()
    notes = "\n".join(f"- {m.content[:800]}" for m in reversed(recent)) or "(none)"
    try:
        brief = await analyst.generate_brief(title=case.title, description=case.description or "",
                                             graph_summary=graph.summary_for_llm(20000), notes=notes,
                                             victims=graph.victims(), known_roles=graph.person_roles())
    except Exception as e:
        raise HTTPException(status_code=502, detail=_public_error(e))

    case.brief_json = json.dumps(brief)
    case.brief_generated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    audit.record(db, "brief.generate", user_id=current_user.id, case_id=case.id)
    await db.commit()
    return {"brief": brief, "generated_at": iso(case.brief_generated_at)}


# ------------------------------------------------------------------- report

@router.get("/report", response_class=PlainTextResponse)
async def export_report(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Full case file as Markdown: brief, entities, relationships, timeline, evidence register, log."""
    billing.require_pro(current_user, "Case file export")
    case = await get_owned_case(db, case_id, current_user)
    graph = load_graph(case)
    evidence = (await db.execute(select(Evidence).where(Evidence.case_id == case.id).order_by(Evidence.id))).scalars().all()
    messages = (await db.execute(select(Message).where(Message.case_id == case.id).order_by(Message.id))).scalars().all()
    nodes, edges = graph.get_data_for_visualization()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    out = [f"# Case File: {case.title}", "",
           f"**Case number:** {case.case_number or case.id}  ",
           f"**Status:** {case.status or 'active'} | **Priority:** {case.priority or 'medium'}  ",
           f"**Lead investigator:** {current_user.full_name or current_user.email}  ",
           f"**Generated:** {now}", "",
           "> AI-assisted analysis. All findings must be independently verified before any operational or legal use.", ""]
    if case.description:
        out += ["## Case Description", case.description, ""]

    if case.brief_json:
        brief = json.loads(case.brief_json)
        out += ["## Intelligence Brief", f"**{brief.get('headline', '')}**", "", brief.get("summary", ""), ""]
        if brief.get("persons_of_interest"):
            out += ["### Persons of Interest", "| Name | Role | Score | Motive | Opportunity |", "|---|---|---|---|---|"]
            for p in brief["persons_of_interest"]:
                out.append(f"| {p.get('name','')} | {p.get('role','')} | {p.get('suspicion_score','')} | "
                           f"{p.get('motive','')} | {p.get('opportunity','')} |")
            out.append("")
        for title, key in (("Evidence Gaps", "evidence_gaps"), ("Next Steps", "next_steps")):
            if brief.get(key):
                out += [f"### {title}", *[f"- {x}" for x in brief[key]], ""]

    out += ["## Entities", "| Entity | Type | Description |", "|---|---|---|"]
    for n in sorted(nodes, key=lambda n: (n["type"], n["label"])):
        out.append(f"| {n['label']} | {n['type']} | {n.get('description') or ''} |")
    out += ["", "## Relationships"]
    for e in edges:
        ev = f' - "{e["evidence"][0]}"' if e.get("evidence") else ""
        out.append(f"- **{e['source']}** {e['label'].replace('_', ' ')} **{e['target']}**{ev}")

    timeline = graph.get_timeline()
    if timeline:
        out += ["", "## Timeline"]
        out += [f"- **{t['time']}** - {t['description']}" for t in timeline]

    out += ["", "## Evidence Register", "| # | File | Type | SHA-256 | Received |", "|---|---|---|---|---|"]
    for ev in evidence:
        out.append(f"| {ev.id} | {ev.filename} | {ev.kind} | `{ev.sha256[:16]}...` | {iso(ev.created_at)} |")

    out += ["", "## Investigation Log"]
    for m in messages:
        who = "Investigator" if m.role == "user" else "SENTINEL (AI)"
        out += [f"### {who} - {iso(m.created_at)}", m.content, ""]

    audit.record(db, "case.export", user_id=current_user.id, case_id=case.id)
    await db.commit()
    return "\n".join(out)
