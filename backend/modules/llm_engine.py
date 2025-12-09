import os
import json
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import List, Optional

# Define data structures for extraction
class Entity(BaseModel):
    name: str = Field(description="Name of the entity")
    type: str = Field(description="Type of the entity (Person, Location, Object, Event, Organization)")
    attributes: Optional[dict] = Field(description="Additional attributes like age, role, etc.")

class Relation(BaseModel):
    source: str = Field(description="Name of the source entity")
    target: str = Field(description="Name of the target entity")
    relation_type: str = Field(description="Type of relationship (e.g., seen_at, works_for, knows)")

class ExtractionResult(BaseModel):
    entities: List[Entity]
    relations: List[Relation]

class CrimeAnalyst:
    def __init__(self, provider="google", api_key=None, model_name=None):
        self.provider = provider
        self.model_name = model_name or "gemini-flash-latest"
        self.client_ready = self._initialize_client(provider, api_key)
        
    def _initialize_client(self, provider, api_key):
        if provider == "google":
            if not api_key:
                api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                print("[ERROR] GOOGLE_API_KEY not found.")
                return False
            
            try:
                genai.configure(api_key=api_key)
                return True
            except Exception as e:
                print(f"[ERROR] Failed to configure Google Gemini: {e}")
                return False
                
        # Fallback to Nvidia/OpenAI logic if needed (kept for compatibility)
        elif provider == "nvidia":
            from openai import OpenAI
            if not api_key:
                api_key = os.getenv("NVIDIA_API_KEY")
            if not api_key:
                return None
            self.openai_client = OpenAI(
                base_url="https://integrate.api.nvidia.com/v1",
                api_key=api_key
            )
            return True
            
        return False

    def _call_llm(self, messages, temperature=0.2, max_tokens=4096, json_mode=False):
        """Call the LLM and return the response content."""
        if not self.client_ready:
            print("[ERROR] LLM client not initialized.")
            return None
            
        if self.provider == "google":
            try:
                # Extract system prompt if present
                system_instruction = None
                chat_history = []
                last_user_message = ""
                
                for msg in messages:
                    if msg["role"] == "system":
                        system_instruction = msg["content"]
                    elif msg["role"] == "user":
                        last_user_message = msg["content"]
                        chat_history.append({"role": "user", "parts": [msg["content"]]})
                    elif msg["role"] == "assistant":
                        chat_history.append({"role": "model", "parts": [msg["content"]]})
                
                # Gemini doesn't support chat history in the generate_content call directly like this
                # For this simple implementation where we usually have 1 system + 1 user, or system + history + user
                # We will instantiate the model with system instruction
                
                generation_config = {
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                }
                
                if json_mode:
                    generation_config["response_mime_type"] = "application/json"
                
                model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=system_instruction,
                    generation_config=generation_config
                )
                
                # If we have history (more than just the last message), we use confirm chat
                # But for our use cases (extraction/analysis), it's usually stateless one-shot
                # so we can just send the last user message or the appropriate prompt.
                
                # For safety, if there are multiple user/assistant turns, we should use start_chat
                # But our current usage in extract_entities/analyze_case is effectively one-shot.
                # Let's verify messages structure.
                
                # extract_entities: [system, user]
                # analyze_case: [system, user]
                
                response = model.generate_content(last_user_message)
                return response.text
                
            except Exception as e:
                import traceback
                print(f"[ERROR] Error calling Gemini: {type(e).__name__}: {e}")
                traceback.print_exc()
                return None

        # Fallback to Nvidia logic
        elif self.provider == "nvidia":
            try:
                completion = self.openai_client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    top_p=0.7,
                    max_tokens=max_tokens,
                    stream=False
                )
                return completion.choices[0].message.content
            except Exception as e:
                import traceback
                print(f"[ERROR] Error calling LLM: {type(e).__name__}: {e}")
                traceback.print_exc()
                return None
        
        return None

    def extract_entities(self, text, existing_entities=None):
        """Extracts entities and relations from text, considering existing entities."""
        if not self.client_ready:
            return self._mock_extraction(text)

        if existing_entities is None:
            existing_entities = []

        # Build context
        entity_context = ""
        if existing_entities:
            entity_context = f"""
Existing KNOWLEDGE GRAPH entities: {', '.join(existing_entities)}

CRITICAL:
1. If an extracted entity matches an existing one, use the EXACT SAME NAME.
2. Match names semantically (e.g. "Mike" -> "Michael Smith").
"""

        system_prompt = f"""You are an expert crime analyst. Extract entities and relations from the text to build a knowledge graph.

output MUST be a JSON object with this structure:
{{
  "entities": [
    {{"name": "Entity Name", "type": "Person|Location|Event|Object|Organization", "attributes": {{ "role": "..." }} }}
  ],
  "relations": [
    {{"source": "Entity Name", "target": "Entity Name", "relation_type": "verb_phrase"}}
  ]
}}

Entity Types: Person, Location, Event, Object, Organization.
Include attributes like age, role, time, etc in attributes dict.

{entity_context}
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Analyze this text:\n{text}"}
        ]
        
        try:
            # Use json_mode=True for Gemini
            response = self._call_llm(messages, json_mode=True)
            print(f"[DEBUG] Raw LLM response: {response[:200] if response else 'None'}...")
            
            if response:
                # Gemini JSON mode returns pure JSON, so we can parse directly
                try:
                    result = json.loads(response)
                    # Helper to normalize if needed (Gemini usually follows schema well in JSON mode)
                    return result
                except json.JSONDecodeError:
                    # Fallback for cleanup if it didn't strictly follow JSON mode (rare)
                    import re
                    json_match = re.search(r'\{[\s\S]*\}', response)
                    if json_match:
                        return json.loads(json_match.group(0))
            
            return {"entities": [], "relations": []}

        except Exception as e:
            print(f"Error in extraction: {e}")
            return {"entities": [], "relations": []}

    def analyze_case(self, current_situation, graph_context):
        """Analyzes the case and suggests next steps."""
        if not self.client_ready:
            return self._mock_analysis(current_situation)

        messages = [
            {"role": "system", "content": "You are a senior detective AI. Analyze the situation and legal knowledge graph."},
            {"role": "user", "content": f"Situation: {current_situation}\n\nGraph Context: {json.dumps(graph_context)}\n\nProvide:\n1. Analysis\n2. Potential leads\n3. Next steps"}
        ]
        
        try:
            response = self._call_llm(messages, max_tokens=8192)
            return response if response else self._mock_analysis(current_situation)
        except Exception as e:
            return f"Error in analysis: {e}"

    def _mock_extraction(self, text):
        return {
            "entities": [{"name": "Mock Entity", "type": "Person", "attributes": {}}],
            "relations": []
        }

    def _mock_analysis(self, text):
        return "System is in offline mode. Please check API key configuration."
