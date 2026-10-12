const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const TOKEN_KEY = 'crime_gpt_token';

export const tokenStore = {
  get: (): string | null => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (token: string) => {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

// ---------------------------------------------------------------- types

export interface User {
  id: number;
  email: string;
  full_name?: string | null;
  organization?: string | null;
  badge_role?: string | null;
}

export type CaseStatus = 'active' | 'cold' | 'closed';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface Case {
  id: number;
  title: string;
  case_number: string;
  description: string;
  status: CaseStatus;
  priority: CasePriority;
  created_at: string;
  updated_at: string;
  entity_count: number;
  message_count: number;
  evidence_count: number;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  created_at?: string;
  pending?: boolean;
  error?: string;
  graphDelta?: GraphChanges;
}

export interface CaseDetail extends Case {
  messages: Array<{ id: number; role: string; content: string; created_at: string }>;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
  description: string;
  aliases: string[];
  attributes: Record<string, unknown>;
  mentions: number;
  degree: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  evidence: string[];
  confidence: number | null;
  time: string;
}

export interface GraphStats {
  entities: number;
  relations: number;
  events: number;
  by_type: Record<string, number>;
}

export interface GraphLayout {
  positions: Record<string, [number, number]>;
  camera: { x: number; y: number; k: number } | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
  entity_types: string[];
  layout: GraphLayout;
}

export interface GraphChanges {
  entities_added: number;
  entities_updated: number;
  relations_added: number;
  events_added: number;
}

export interface TimelineEvent {
  id: string;
  time: string;
  sort_key: string;
  description: string;
  entities: string[];
  source: string;
}

export interface Evidence {
  id: number;
  filename: string;
  kind: 'document' | 'image' | 'text';
  char_count: number;
  sha256: string;
  preview: string;
  created_at: string;
  content?: string;
}

export interface PersonOfInterest {
  name: string;
  role: string;
  suspicion_score: number;
  motive?: string;
  means?: string;
  opportunity?: string;
  alibi?: string;
  key_evidence?: string[];
  reasoning?: string;
}

export interface Brief {
  headline?: string;
  summary?: string;
  persons_of_interest?: PersonOfInterest[];
  hypotheses?: Array<{ theory: string; likelihood: number; supporting?: string[]; against?: string[] }>;
  contradictions?: Array<{ description: string; entities?: string[]; severity?: 'low' | 'medium' | 'high' }>;
  evidence_gaps?: string[];
  leads?: Array<{ lead: string; priority?: 'high' | 'medium' | 'low'; rationale?: string }>;
  next_steps?: string[];
}

// -------------------------------------------------------------- billing

export type Interval = 'monthly' | 'yearly';
export type Metric = 'cases' | 'messages' | 'uploads' | 'briefs';
export type Limits = Record<Metric, number>;

export interface Paywall {
  code: string; // limit_reached | pro_feature
  message: string;
  metric: string | null;
}

export interface Plans {
  enabled: boolean;
  key_id: string | null;
  currency: string;
  monthly: { price: number };
  yearly: { price: number; per_month: number; savings: number; savings_pct: number };
  free_limits: Limits;
  pro_limits: Limits;
}

export interface BillingSummary {
  plan: 'free' | 'pro';
  interval: Interval | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  complimentary: boolean;
  limits: Limits;
  usage: Limits;
  usage_resets_at: string;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  status: string;
  created_at: string;
}

export interface CheckoutSession {
  subscription_id: string;
  key_id: string;
  interval: Interval;
  amount: number;
  product: string;
}

export type StreamEvent =
  | { type: 'status'; stage: 'extracting' | 'analyzing' }
  | { type: 'graph'; stats: GraphStats; changes: GraphChanges }
  | { type: 'reasoning'; text: string }
  | { type: 'token'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done'; message_id: number | null; user_message_id: number };

// ---------------------------------------------------------------- core

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

/** Called when the server says the current plan doesn't cover a request (HTTP 402). */
let onPaymentRequired: ((info: Paywall) => void) | null = null;
export const setPaymentRequiredHandler = (fn: ((info: Paywall) => void) | null) => { onPaymentRequired = fn; };

type ErrorBody = { detail?: string | { msg: string }[] | { code?: string; message?: string; metric?: string | null } };

/** Turn an error response into an ApiError, notifying the paywall handler on 402. */
async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  const body: ErrorBody = await response.json().catch(() => ({}));
  const detail = body.detail;
  let message = fallback;
  let code: string | undefined;
  if (typeof detail === 'string') message = detail;
  else if (Array.isArray(detail)) message = detail.map((d) => d.msg).join('; ');
  else if (detail && typeof detail === 'object') {
    message = detail.message || fallback;
    code = detail.code;
  }
  if (response.status === 402) onPaymentRequired?.({ code: code || 'limit_reached', message, metric: (detail as { metric?: string })?.metric || null });
  return new ApiError(response.status, message, code);
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (auth && token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection - the API may be waking up.');
  }

  if (response.status === 401 && auth) onUnauthorized?.();
  if (!response.ok) throw await toApiError(response, `Request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  const type = response.headers.get('content-type') || '';
  return (type.includes('application/json') ? response.json() : response.text()) as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

// ------------------------------------------------------------ streaming

async function streamChat(
  caseId: number,
  message: string,
  evidenceIds: number[],
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = tokenStore.get();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/cases/${caseId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: json({ message, evidence_ids: evidenceIds }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new ApiError(0, 'Cannot reach the server.');
  }
  if (response.status === 401) onUnauthorized?.();
  if (!response.ok || !response.body) throw await toApiError(response, 'The analyst could not respond.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (data) {
        try { onEvent(JSON.parse(data)); } catch { /* ignore malformed frame */ }
      }
    }
  }
}

// ------------------------------------------------------------------ api

export const api = {
  baseUrl: API_BASE_URL,

  // auth
  authConfig: () => request<{ invite_required: boolean }>('/auth/config', {}, false),
  login: (email: string, password: string) =>
    request<{ access_token: string }>('/auth/login', { method: 'POST', body: json({ email, password }) }, false),
  register: (data: { email: string; password: string; full_name?: string; organization?: string; badge_role?: string; invite_code?: string }) =>
    request<{ access_token: string }>('/auth/register', { method: 'POST', body: json(data) }, false),
  me: () => request<User>('/auth/me'),
  health: () => request<{ ai_online: boolean; reasoning_model: string }>('/health', {}, false),

  // cases
  getCases: () => request<Case[]>('/api/cases'),
  createCase: (data: { title: string; description?: string; priority?: CasePriority }) =>
    request<Case>('/api/cases', { method: 'POST', body: json(data) }),
  getCase: (id: number) => request<CaseDetail>(`/api/cases/${id}`),
  updateCase: (id: number, data: Partial<Pick<Case, 'title' | 'description' | 'status' | 'priority'>>) =>
    request<Case>(`/api/cases/${id}`, { method: 'PATCH', body: json(data) }),
  deleteCase: (id: number) => request<void>(`/api/cases/${id}`, { method: 'DELETE' }),

  // investigation
  streamChat,
  getGraph: (id: number) => request<GraphData>(`/api/cases/${id}/graph`),
  getTimeline: (id: number) => request<TimelineEvent[]>(`/api/cases/${id}/timeline`),
  mergeEntities: (id: number, keep: string, merge: string) =>
    request<{ ok: boolean }>(`/api/cases/${id}/graph/merge`, { method: 'POST', body: json({ keep, merge }) }),
  updateEntity: (id: number, name: string, data: { type?: string; description?: string }) =>
    request<{ ok: boolean }>(`/api/cases/${id}/graph/entities/${encodeURIComponent(name)}`, { method: 'PATCH', body: json(data) }),
  deleteEntity: (id: number, name: string) =>
    request<{ ok: boolean }>(`/api/cases/${id}/graph/entities/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  saveLayout: (id: number, positions: Record<string, [number, number] | null>, camera?: GraphLayout['camera']) =>
    request<{ ok: boolean }>(`/api/cases/${id}/graph/layout`, { method: 'PUT', body: json({ positions, camera }) }),
  clearGraph: (id: number) => request<{ success: boolean }>(`/api/cases/${id}/clear`, { method: 'POST' }),

  getEvidence: (id: number) => request<Evidence[]>(`/api/cases/${id}/evidence`),
  getEvidenceItem: (id: number, evidenceId: number) => request<Evidence>(`/api/cases/${id}/evidence/${evidenceId}`),
  uploadEvidence: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ evidence: Evidence; changes: GraphChanges; stats: GraphStats }>(
      `/api/cases/${id}/evidence`, { method: 'POST', body: form });
  },

  getBrief: (id: number) => request<{ brief: Brief | null; generated_at: string | null }>(`/api/cases/${id}/brief`),
  generateBrief: (id: number) =>
    request<{ brief: Brief; generated_at: string }>(`/api/cases/${id}/brief`, { method: 'POST' }),
  getReport: (id: number) => request<string>(`/api/cases/${id}/report`),

  // billing
  getPlans: () => request<Plans>('/api/billing/plans', {}, false),
  getBilling: () => request<BillingSummary>('/api/billing/me'),
  getPayments: () => request<PaymentRecord[]>('/api/billing/payments'),
  subscribe: (interval: Interval) =>
    request<CheckoutSession>('/api/billing/subscribe', { method: 'POST', body: json({ interval }) }),
  verifyPayment: (data: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) =>
    request<BillingSummary>('/api/billing/verify', { method: 'POST', body: json(data) }),
  cancelSubscription: () => request<BillingSummary>('/api/billing/cancel', { method: 'POST' }),
};
