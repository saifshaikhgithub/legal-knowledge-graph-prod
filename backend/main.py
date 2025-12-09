"""
Crime Investigation GPT API - Multi-user version with authentication and per-case graphs.
"""
import os
import json
from typing import List, Dict, Any, Optional
from io import BytesIO
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import PyPDF2
from docx import Document
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import init_db, get_db
from models import User, Case, Message
from auth import get_current_user, decode_token
from modules.graph_manager import CrimeGraph
from modules.llm_engine import CrimeAnalyst
from routers import auth as auth_router
from routers import cases as cases_router

load_dotenv()


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize database
    await init_db()
    print("Database initialized")
    yield
    # Shutdown: cleanup if needed
    pass


# Initialize FastAPI app
app = FastAPI(
    title="Crime Investigation GPT API",
    version="2.0.0",
    lifespan=lifespan
)

# CORS configuration
# CORS configuration
origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
origins = [origin.strip() for origin in origins_str.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(cases_router.router)

# Create analyst instance (shared, stateless)
analyst = CrimeAnalyst(provider="google")


# Pydantic models for request/response
class ChatMessage(BaseModel):
    message: str
    file_content: Optional[str] = None


class ChatResponse(BaseModel):
    user_message: str
    assistant_message: str
    graph_updated: bool


class GraphData(BaseModel):
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]


class ClearResponse(BaseModel):
    success: bool
    message: str


# Helper function to extract text from files
def extract_text_from_file(file: UploadFile) -> str:
    """Extract text from uploaded files (PDF, DOCX, TXT)"""
    try:
        file_content = file.file.read()
        file.file.seek(0)
        
        if file.filename.endswith('.pdf'):
            pdf_reader = PyPDF2.PdfReader(BytesIO(file_content))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()
        
        elif file.filename.endswith('.docx'):
            doc = Document(BytesIO(file_content))
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip()
        
        elif file.filename.endswith('.txt'):
            return file_content.decode('utf-8')
        
        else:
            return f"[File: {file.filename} - Type not supported for text extraction]"
    
    except Exception as e:
        return f"[Error extracting text from {file.filename}: {str(e)}]"


def load_graph_from_case(case: Case) -> CrimeGraph:
    """Load a CrimeGraph from case's stored JSON."""
    graph = CrimeGraph()
    if case.graph_json:
        try:
            data = json.loads(case.graph_json)
            graph.from_json(data)
        except (json.JSONDecodeError, Exception) as e:
            print(f"Error loading graph: {e}")
    return graph


def save_graph_to_case(case: Case, graph: CrimeGraph) -> None:
    """Save a CrimeGraph to case's JSON field."""
    case.graph_json = json.dumps(graph.to_json())


# ==================== REST API Endpoints ====================

@app.get("/")
async def root():
    return {"message": "Crime Investigation GPT API", "version": "2.0.0"}


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload and extract text from a file (protected)"""
    try:
        extracted_text = extract_text_from_file(file)
        return {
            "filename": file.filename,
            "text": extracted_text,
            "length": len(extracted_text)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(
    chat_message: ChatMessage,
    case_id: int = Query(..., description="Case ID to use for this chat"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Process a chat message within a specific case context.
    Extracts entities, updates the case's graph, and returns analysis.
    """
    try:
        # Verify case belongs to user
        result = await db.execute(
            select(Case).where(Case.id == case_id, Case.user_id == current_user.id)
        )
        case = result.scalar_one_or_none()
        
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        # Combine message with file content if provided
        user_message = chat_message.message
        if chat_message.file_content:
            user_message = f"{chat_message.message}\n\nFile Content:\n{chat_message.file_content}"
        
        # Load graph for this case
        graph = load_graph_from_case(case)
        
        # Get existing entities for context
        existing_entities = graph.get_all_entities()
        
        # Extract entities and relations
        extraction = analyst.extract_entities(user_message, existing_entities)
        
        # Update graph
        graph_updated = False
        if isinstance(extraction, dict):
            for entity in extraction.get('entities', []):
                name = entity.get('name')
                if name:
                    graph.add_entity(
                        name,
                        entity.get('type'),
                        entity.get('attributes')
                    )
                    graph_updated = True
            
            for relation in extraction.get('relations', []):
                source = relation.get('source')
                target = relation.get('target')
                if source and target:
                    graph.add_relation(
                        source,
                        target,
                        relation.get('relation_type')
                    )
                    graph_updated = True
        
        # Save graph back to case
        save_graph_to_case(case, graph)
        
        # Analyze the case
        graph_context = graph.to_json()
        analysis = analyst.analyze_case(user_message, graph_context)
        
        # Save messages to database
        user_msg = Message(case_id=case.id, role="user", content=chat_message.message)
        assistant_msg = Message(case_id=case.id, role="assistant", content=analysis)
        db.add(user_msg)
        db.add(assistant_msg)
        db.add(case)  # Ensure graph_json changes are persisted
        
        await db.commit()
        
        return ChatResponse(
            user_message=chat_message.message,
            assistant_message=analysis,
            graph_updated=graph_updated
        )
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing message: {str(e)}")


@app.get("/api/graph", response_model=GraphData)
async def get_graph(
    case_id: int = Query(..., description="Case ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the knowledge graph data for a specific case.
    """
    try:
        # Verify case belongs to user
        result = await db.execute(
            select(Case).where(Case.id == case_id, Case.user_id == current_user.id)
        )
        case = result.scalar_one_or_none()
        
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        # Load and return graph data
        graph = load_graph_from_case(case)
        nodes_data, edges_data = graph.get_data_for_visualization()
        return GraphData(nodes=nodes_data, edges=edges_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving graph: {str(e)}")


@app.post("/api/clear", response_model=ClearResponse)
async def clear_graph(
    case_id: int = Query(..., description="Case ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Clear the knowledge graph for a specific case.
    """
    try:
        # Verify case belongs to user
        result = await db.execute(
            select(Case).where(Case.id == case_id, Case.user_id == current_user.id)
        )
        case = result.scalar_one_or_none()
        
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        
        # Reset graph to empty
        empty_graph = CrimeGraph()
        save_graph_to_case(case, empty_graph)
        await db.commit()
        
        return ClearResponse(success=True, message="Knowledge graph cleared successfully")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing graph: {str(e)}")


# ==================== WebSocket for Real-time Chat ====================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}  # case_id -> connections

    async def connect(self, websocket: WebSocket, case_id: int):
        await websocket.accept()
        if case_id not in self.active_connections:
            self.active_connections[case_id] = []
        self.active_connections[case_id].append(websocket)

    def disconnect(self, websocket: WebSocket, case_id: int):
        if case_id in self.active_connections:
            self.active_connections[case_id].remove(websocket)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
    case_id: int = Query(...)
):
    """
    WebSocket endpoint for real-time chat communication.
    Requires token and case_id as query parameters.
    """
    # Verify token
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    user_id = payload.get("sub")
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token")
        return
    
    # Get database session and verify case ownership
    async with get_db() as db:
        result = await db.execute(
            select(Case).where(Case.id == case_id, Case.user_id == user_id)
        )
        case = result.scalar_one_or_none()
        
        if not case:
            await websocket.close(code=4004, reason="Case not found")
            return
    
    await manager.connect(websocket, case_id)
    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            
            # Echo user message back
            await manager.send_personal_message({
                "type": "user",
                "content": message
            }, websocket)
            
            # Process the message (simplified for WebSocket)
            async with get_db() as db:
                result = await db.execute(
                    select(Case).where(Case.id == case_id)
                )
                case = result.scalar_one_or_none()
                if case:
                    graph = load_graph_from_case(case)
                    existing_entities = graph.get_all_entities()
                    extraction = analyst.extract_entities(message, existing_entities)
                    
                    if isinstance(extraction, dict):
                        for entity in extraction.get('entities', []):
                            name = entity.get('name')
                            if name:
                                graph.add_entity(name, entity.get('type'), entity.get('attributes'))
                        
                        for relation in extraction.get('relations', []):
                            source = relation.get('source')
                            target = relation.get('target')
                            if source and target:
                                graph.add_relation(source, target, relation.get('relation_type'))
                    
                    save_graph_to_case(case, graph)
                    
                    graph_context = graph.to_json()
                    analysis = analyst.analyze_case(message, graph_context)
                    
                    # Save messages
                    db.add(Message(case_id=case_id, role="user", content=message))
                    db.add(Message(case_id=case_id, role="assistant", content=analysis))
                    await db.commit()
                    
                    # Send assistant response
                    await manager.send_personal_message({
                        "type": "assistant",
                        "content": analysis
                    }, websocket)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, case_id)


# ==================== Health Check ====================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "llm_provider": analyst.provider,
        "version": "2.0.0"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
