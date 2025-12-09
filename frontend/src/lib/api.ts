// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');

// Token management
function getToken(): string | null {
  return localStorage.getItem('crime_gpt_token');
}

function getAuthHeaders(): HeadersInit {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Case {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CaseDetail extends Case {
  messages: Array<{
    id: number;
    role: string;
    content: string;
    created_at: string;
  }>;
}

export interface User {
  id: number;
  email: string;
}

// Auth API functions
async function login(email: string, password: string): Promise<{ access_token: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Login failed');
  }

  return response.json();
}

async function register(email: string, password: string): Promise<{ access_token: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Registration failed');
  }

  return response.json();
}

async function getCurrentUser(token?: string): Promise<User> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || getToken()}`,
  };

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

// Case API functions
async function getCases(): Promise<Case[]> {
  const response = await fetch(`${API_BASE_URL}/api/cases`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch cases');
  }

  return response.json();
}

async function createCase(title: string): Promise<Case> {
  const response = await fetch(`${API_BASE_URL}/api/cases`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error('Failed to create case');
  }

  return response.json();
}

async function getCase(caseId: number): Promise<CaseDetail> {
  const response = await fetch(`${API_BASE_URL}/api/cases/${caseId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch case');
  }

  return response.json();
}

async function deleteCase(caseId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/cases/${caseId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete case');
  }
}

async function getCaseMessages(caseId: number): Promise<CaseDetail['messages']> {
  const response = await fetch(`${API_BASE_URL}/api/cases/${caseId}/messages`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }

  return response.json();
}

// Chat API functions
async function sendMessage(caseId: number, message: string, fileContent?: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/chat?case_id=${caseId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      message,
      file_content: fileContent,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  return response.json();
}

// Upload file and extract text
async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const token = getToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload file');
  }

  const data = await response.json();
  return data.text;
}

// Get graph data for a case
async function getGraph(caseId: number): Promise<GraphData> {
  const response = await fetch(`${API_BASE_URL}/api/graph?case_id=${caseId}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch graph');
  }

  return response.json();
}

// Clear graph for a case
async function clearGraph(caseId: number): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/clear?case_id=${caseId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to clear graph');
  }

  return response.json();
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandlers: ((message: any) => void)[] = [];

  connect(caseId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const token = getToken();
      if (!token) {
        reject(new Error('No auth token'));
        return;
      }

      this.ws = new WebSocket(`${WS_BASE_URL}/ws?token=${token}&case_id=${caseId}`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.messageHandlers.forEach((handler) => handler(data));
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
      };
    });
  }

  sendMessage(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ message }));
    }
  }

  onMessage(handler: (message: any) => void) {
    this.messageHandlers.push(handler);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const api = {
  // Auth
  login,
  register,
  getCurrentUser,
  // Cases
  getCases,
  createCase,
  getCase,
  deleteCase,
  getCaseMessages,
  // Chat
  sendMessage,
  uploadFile,
  // Graph
  getGraph,
  clearGraph,
  // WebSocket
  WebSocketClient,
};
