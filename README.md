# Crime Investigation GPT 🕵️‍♂️

An AI-powered crime investigation assistant that builds dynamic knowledge graphs from investigation data. Uses Google's Gemini AI to extract entities, relationships, and provide intelligent case analysis.

## 🌟 Features

- **Interactive Chat Interface** - ChatGPT-like UI for natural conversation
- **Dynamic Knowledge Graph** - Real-time visualization of entities and relationships
- **Entity Extraction** - Automatically extracts people, locations, objects, events, and organizations
- **Relationship Mapping** - Intelligently connects entities with various relationship types
- **File Upload** - Supports PDF, DOCX, and TXT evidence files
- **Voice Input** - Speech-to-text for hands-free operation
- **Graph Interaction** - Drag nodes, highlight connections, explore relationships
- **Smart Deduplication** - Prevents duplicate entities across the investigation

## 🏗️ Architecture

```
crime-investigation-gpt/
├── backend/               # FastAPI backend
│   ├── main.py           # API server
│   ├── modules/
│   │   ├── llm_engine.py      # Gemini AI integration
│   │   ├── graph_manager.py   # Knowledge graph logic
│   └── requirements.txt
│
└── frontend/             # React + TypeScript frontend
    ├── src/
    │   ├── components/
    │   │   ├── Chat.tsx        # Chat interface
    │   │   ├── GraphView.tsx   # Knowledge graph visualization
    │   │   └── Sidebar.tsx     # Navigation
    └── package.json
```

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- Google Gemini API Key

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Create .env file
echo GOOGLE_API_KEY=your_api_key_here > .env

# Run backend
uvicorn main:app --reload
```

Backend runs on `http://localhost:8000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend runs on `http://localhost:5173`

## 📊 Usage

1. **Start Investigation**: Open the app and click on "Investigation Room"
2. **Add Evidence**: Type details or upload files (PDF/DOCX/TXT)
3. **Use Voice**: Click the microphone icon for hands-free input
4. **Explore Graph**: Switch to "Evidence Graph" to see connections
5. **Interact**: 
   - Click nodes to highlight relationships
   - Drag nodes to reorganize the graph
   - Click the same node again to deselect

## 🔑 API Endpoints

- `POST /api/chat` - Send investigation updates
- `GET /api/graph` - Get current knowledge graph
- `POST /api/upload` - Upload evidence files
- `POST /api/clear` - Clear investigation data

## 🛠️ Technologies

**Backend:**
- FastAPI - Modern Python web framework
- LangChain - LLM orchestration
- Google Gemini - AI model (gemini-2.0-flash)
- NetworkX - Graph data structure

**Frontend:**
- React 18 - UI framework
- TypeScript - Type safety
- ReactFlow - Graph visualization
- Tailwind CSS - Styling
- Shadcn/UI - Component library

## 📝 License

MIT License - feel free to use this project for your own investigations!

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.