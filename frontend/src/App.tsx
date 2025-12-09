import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Chat } from './components/Chat';
import { Sidebar } from './components/Sidebar';
import { GraphView } from './components/GraphView';
import { Login } from './components/Login';
import { Register } from './components/Register';
import { api, type ChatMessage, type GraphNode, type GraphEdge, type Case } from './lib/api';
import { ThemeProvider } from './lib/ThemeContext';
import { AuthProvider, useAuth } from './lib/AuthContext';
import './index.css';

type Tab = 'chat' | 'graph';

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Main app content (protected)
function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Case management state
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [isCasesLoading, setIsCasesLoading] = useState(true);

  // Load cases on mount
  useEffect(() => {
    loadCases();
  }, []);

  // Load case data when selected case changes
  useEffect(() => {
    if (selectedCaseId) {
      loadCaseData(selectedCaseId);
    } else {
      setMessages([]);
      setGraphNodes([]);
      setGraphEdges([]);
    }
  }, [selectedCaseId]);

  // Load graph when switching to graph tab
  useEffect(() => {
    if (activeTab === 'graph' && selectedCaseId) {
      loadGraph();
    }
  }, [activeTab, selectedCaseId]);

  const loadCases = async () => {
    setIsCasesLoading(true);
    try {
      const userCases = await api.getCases();
      setCases(userCases);
      // Select first case if available
      if (userCases.length > 0 && !selectedCaseId) {
        setSelectedCaseId(userCases[0].id);
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    } finally {
      setIsCasesLoading(false);
    }
  };

  const loadCaseData = async (caseId: number) => {
    try {
      const caseDetail = await api.getCase(caseId);
      // Convert messages to ChatMessage format
      const chatMessages: ChatMessage[] = caseDetail.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      setMessages(chatMessages);

      // Also load graph
      await loadGraph();
    } catch (error) {
      console.error('Failed to load case data:', error);
    }
  };

  const loadGraph = async () => {
    if (!selectedCaseId) return;
    try {
      const data = await api.getGraph(selectedCaseId);
      setGraphNodes(data.nodes);
      setGraphEdges(data.edges);
    } catch (error) {
      console.error('Failed to load graph:', error);
    }
  };

  const handleSendMessage = async (message: string, fileContent?: string) => {
    if (!selectedCaseId) {
      alert('Please select or create a case first');
      return;
    }

    // Add user message immediately
    const userMessage: ChatMessage = { role: 'user', content: message };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Send to API with case ID
      const response = await api.sendMessage(selectedCaseId, message, fileContent);

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.assistant_message,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Reload graph if updated
      if (response.graph_updated) {
        await loadGraph();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your message. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearMemory = async () => {
    if (!selectedCaseId) return;
    try {
      await api.clearGraph(selectedCaseId);
      setGraphNodes([]);
      setGraphEdges([]);
      // Reload case data to get fresh state
      await loadCaseData(selectedCaseId);
    } catch (error) {
      console.error('Failed to clear graph:', error);
    }
  };

  const handleCreateCase = async (title: string) => {
    try {
      const newCase = await api.createCase(title);
      setCases((prev) => [newCase, ...prev]);
      setSelectedCaseId(newCase.id);
      setMessages([]);
      setGraphNodes([]);
      setGraphEdges([]);
    } catch (error) {
      console.error('Failed to create case:', error);
    }
  };

  const handleDeleteCase = async (caseId: number) => {
    try {
      await api.deleteCase(caseId);
      setCases((prev) => prev.filter((c) => c.id !== caseId));
      if (selectedCaseId === caseId) {
        const remaining = cases.filter((c) => c.id !== caseId);
        setSelectedCaseId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      console.error('Failed to delete case:', error);
    }
  };

  const handleSelectCase = (caseId: number) => {
    if (caseId !== selectedCaseId) {
      setSelectedCaseId(caseId);
      setActiveTab('chat');
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClearMemory={handleClearMemory}
        cases={cases}
        selectedCaseId={selectedCaseId}
        onSelectCase={handleSelectCase}
        onCreateCase={handleCreateCase}
        onDeleteCase={handleDeleteCase}
        isCasesLoading={isCasesLoading}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-background">
          <div className="px-6 py-3">
            <h1 className="text-3xl font-bold text-foreground">
              {activeTab === 'chat' ? 'Investigation' : 'Evidence Board'}
            </h1>
            {selectedCaseId && (
              <p className="text-sm text-muted-foreground mt-1">
                Case: {cases.find(c => c.id === selectedCaseId)?.title || 'Loading...'}
              </p>
            )}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-hidden">
          {!selectedCaseId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <h3 className="text-xl font-bold mb-2">No Case Selected</h3>
                <p className="text-sm">Create a new case or select an existing one to start investigating.</p>
              </div>
            </div>
          ) : activeTab === 'chat' ? (
            <Chat
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
            />
          ) : (
            <GraphView nodes={graphNodes} edges={graphEdges} />
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppContent />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
