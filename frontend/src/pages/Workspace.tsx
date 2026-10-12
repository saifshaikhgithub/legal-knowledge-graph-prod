import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BrainCircuit, FlaskConical, Loader2, Menu, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { NetworkBackground } from '../components/NetworkBackground';
import { CaseSidebar } from '../components/workspace/CaseSidebar';
import { CaseHeader, type Tab } from '../components/workspace/CaseHeader';
import { NewCaseModal } from '../components/workspace/NewCaseModal';
import { ChatPanel } from '../components/workspace/ChatPanel';
import { GraphView } from '../components/workspace/GraphView';
import { TimelineView } from '../components/workspace/TimelineView';
import { BriefView } from '../components/workspace/BriefView';
import { EvidenceView } from '../components/workspace/EvidenceView';
import { api, ApiError, type Brief, type Case, type Evidence, type GraphData, type GraphStats, type TimelineEvent } from '../lib/api';
import { useInvestigation } from '../lib/useInvestigation';
import { useAuth } from '../lib/AuthContext';
import { useBilling } from '../lib/BillingContext';
import { DEMO_CASE } from '../lib/demo';
import { forgetLayout } from '../lib/layoutCache';
import type { Suspicion } from '../lib/entity';
import { BRAND } from '../lib/brand';

export const Workspace = () => {
  const { caseId: caseParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh: refreshBilling } = useBilling();
  const selectedId = caseParam ? Number(caseParam) : null;

  const [cases, setCases] = useState<Case[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('investigate');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [health, setHealth] = useState<{ online: boolean | null; model: string }>({ online: null, model: '' });

  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[] | null>(null);
  const [evidence, setEvidence] = useState<Evidence[] | null>(null);
  const [lockerUpload, setLockerUpload] = useState('');
  const [brief, setBrief] = useState<{ brief: Brief | null; generated_at: string | null } | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null);
  const pendingSend = useRef<string | null>(null);

  const current = cases.find((c) => c.id === selectedId) || null;

  // Brief scores overlaid on the evidence board, matched by name or alias.
  const suspicion = useMemo(() => {
    const map: Record<string, Suspicion> = {};
    for (const p of brief?.brief?.persons_of_interest || []) {
      map[p.name.trim().toLowerCase()] = { score: p.suspicion_score, role: p.role };
    }
    for (const n of graph?.nodes || []) {
      const hit = [n.label, ...n.aliases].map((a) => map[a.trim().toLowerCase()]).find(Boolean);
      if (hit) map[n.label.toLowerCase()] = hit;
    }
    return map;
  }, [brief, graph]);

  // ---------------------------------------------------------------- loaders

  useEffect(() => {
    api.health().then((h) => setHealth({ online: h.ai_online, model: h.reasoning_model })).catch(() => setHealth({ online: false, model: '' }));
    api.getCases()
      .then(setCases)
      .catch(() => {})
      .finally(() => setCasesLoading(false));
  }, []);

  // Land on the most recent case when none is in the URL.
  useEffect(() => {
    if (!casesLoading && !selectedId && cases.length) navigate(`/app/${cases[0].id}`, { replace: true });
    if (!casesLoading && selectedId && cases.length && !current) navigate('/app', { replace: true });
  }, [casesLoading, selectedId, cases, current, navigate]);

  const refreshGraph = useCallback(async (id: number) => {
    setGraphLoading(true);
    try {
      const [g, t] = await Promise.all([api.getGraph(id), api.getTimeline(id)]);
      setGraph(g);
      setTimeline(t);
      setCases((cs) => cs.map((c) => (c.id === id ? { ...c, entity_count: g.stats.entities } : c)));
    } catch { /* keep previous */ } finally {
      setGraphLoading(false);
    }
  }, []);

  const refreshEvidence = useCallback(async (id: number) => {
    try {
      const items = await api.getEvidence(id);
      setEvidence(items);
      setCases((cs) => cs.map((c) => (c.id === id ? { ...c, evidence_count: items.length } : c)));
    } catch { /* keep previous */ }
  }, []);

  useEffect(() => {
    setGraph(null);
    setTimeline(null);
    setEvidence(null);
    setBrief(null);
    setBriefError('');
    if (!selectedId) return;
    refreshGraph(selectedId);
    refreshEvidence(selectedId);
    api.getBrief(selectedId).then(setBrief).catch(() => setBrief({ brief: null, generated_at: null }));
  }, [selectedId, refreshGraph, refreshEvidence]);

  // Graph refreshes are triggered by stream events; coalesce bursts.
  const graphTimer = useRef<number | undefined>(undefined);
  const onGraphChanged = useCallback((stats: GraphStats) => {
    setGraph((g) => (g ? { ...g, stats } : g));
    window.clearTimeout(graphTimer.current);
    graphTimer.current = window.setTimeout(() => selectedId && refreshGraph(selectedId), 400);
  }, [selectedId, refreshGraph]);

  const onEvidenceAdded = useCallback(() => {
    if (selectedId) refreshEvidence(selectedId);
  }, [selectedId, refreshEvidence]);

  const chat = useInvestigation({ caseId: selectedId, onGraphChanged, onEvidenceAdded });

  // Keep the plan usage meter current: refresh when a reply finishes.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !chat.busy) refreshBilling();
    wasBusy.current = chat.busy;
  }, [chat.busy, refreshBilling]);

  // A queued message (from the demo or "ask about entity") is sent once the case's history is loaded.
  useEffect(() => {
    if (pendingSend.current && !chat.loadingHistory && !chat.busy && selectedId) {
      const text = pendingSend.current;
      pendingSend.current = null;
      chat.send(text);
    }
  }, [chat, selectedId]);

  // ----------------------------------------------------------------- actions

  const createCase = async (data: Parameters<typeof api.createCase>[0]) => {
    const created = await api.createCase(data);
    setCases((cs) => [created, ...cs]);
    refreshBilling();
    setTab('investigate');
    navigate(`/app/${created.id}`);
    return created;
  };

  const startDemo = async () => {
    pendingSend.current = DEMO_CASE.briefing;
    await createCase({ title: DEMO_CASE.title, description: DEMO_CASE.description, priority: DEMO_CASE.priority });
  };

  const updateCase = async (changes: Partial<Pick<Case, 'status' | 'priority' | 'title'>>) => {
    if (!current) return;
    setCases((cs) => cs.map((c) => (c.id === current.id ? { ...c, ...changes } : c)));
    try {
      const updated = await api.updateCase(current.id, changes);
      setCases((cs) => cs.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    } catch {
      api.getCases().then(setCases).catch(() => {});
    }
  };

  const deleteCase = async () => {
    if (!current) return;
    await api.deleteCase(current.id);
    setConfirmDelete(false);
    const rest = cases.filter((c) => c.id !== current.id);
    setCases(rest);
    navigate(rest.length ? `/app/${rest[0].id}` : '/app');
  };

  const clearGraph = async () => {
    if (!current) return;
    await api.clearGraph(current.id);
    forgetLayout(current.id);
    setConfirmClear(false);
    setBrief({ brief: null, generated_at: null });
    refreshGraph(current.id);
  };

  const exportReport = async () => {
    if (!current) return;
    let text: string;
    try {
      text = await api.getReport(current.id);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 402)) alert((e as Error).message); // 402 opens the upgrade dialog
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.case_number}-case-file.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateBrief = async () => {
    if (!current) return;
    setBriefBusy(true);
    setBriefError('');
    try {
      setBrief(await api.generateBrief(current.id));
    } catch (e) {
      setBriefError((e as Error).message);
    } finally {
      setBriefBusy(false);
      refreshBilling();
    }
  };

  const uploadToLocker = async (files: File[]) => {
    if (!current) return;
    for (const [i, file] of files.entries()) {
      setLockerUpload(`Processing ${file.name} (${i + 1}/${files.length})`);
      try {
        await api.uploadEvidence(current.id, file);
      } catch (e) {
        if (e instanceof ApiError && e.status === 402) break; // the upgrade dialog explains the limit
        alert(`${file.name}: ${(e as Error).message}`);
      }
    }
    setLockerUpload('');
    refreshBilling();
    refreshEvidence(current.id);
    refreshGraph(current.id);
  };

  const askAbout = (question: string) => {
    setTab('investigate');
    chat.send(question);
  };

  const graphAction = (fn: () => Promise<unknown>) => async () => {
    if (!current) return;
    await fn();
    await refreshGraph(current.id);
  };

  // ------------------------------------------------------------------ render

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <CaseSidebar
        cases={cases}
        loading={casesLoading}
        selectedId={selectedId}
        onSelect={(id) => { navigate(`/app/${id}`); }}
        onNew={() => setNewCaseOpen(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {current ? (
          <>
            <CaseHeader
              caseItem={current}
              stats={graph?.stats || null}
              tab={tab}
              onTab={setTab}
              onUpdate={updateCase}
              onExport={exportReport}
              onClearGraph={() => setConfirmClear(true)}
              onDelete={() => setConfirmDelete(true)}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
            <main className="min-h-0 flex-1">
              {tab === 'investigate' && (
                <ChatPanel
                  caseTitle={current.title}
                  messages={chat.messages}
                  loadingHistory={chat.loadingHistory}
                  stage={chat.stage}
                  uploadNote={chat.uploadNote}
                  busy={chat.busy}
                  onSend={chat.send}
                  onStop={chat.stop}
                  onOpenGraph={() => setTab('graph')}
                  stats={graph?.stats || null}
                  timeline={timeline || []}
                  aiOnline={health.online}
                  model={health.model}
                />
              )}
              {tab === 'graph' && (
                <GraphView
                  key={current.id}
                  caseId={current.id}
                  suspicion={suspicion}
                  data={graph}
                  loading={graphLoading}
                  focusRequest={focusRequest}
                  onAsk={askAbout}
                  onMerge={(keep, merge) => graphAction(() => api.mergeEntities(current.id, keep, merge))()}
                  onRetype={(name, type) => graphAction(() => api.updateEntity(current.id, name, { type }))()}
                  onDelete={(name) => graphAction(() => api.deleteEntity(current.id, name))()}
                />
              )}
              {tab === 'timeline' && (
                <TimelineView
                  events={timeline}
                  nodes={graph?.nodes || []}
                  onEntity={(id) => { setFocusRequest({ id, n: Date.now() }); setTab('graph'); }}
                />
              )}
              {tab === 'brief' && (
                <BriefView
                  brief={brief?.brief || null}
                  generatedAt={brief?.generated_at || null}
                  loading={!brief}
                  generating={briefBusy}
                  error={briefError}
                  hasData={(graph?.stats.entities || 0) > 0}
                  onGenerate={generateBrief}
                />
              )}
              {tab === 'evidence' && (
                <EvidenceView caseId={current.id} items={evidence} uploading={lockerUpload} onUpload={uploadToLocker} />
              )}
            </main>
          </>
        ) : casesLoading || (selectedId && !current) ? (
          <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="relative grid h-full place-items-center overflow-hidden px-4">
            <NetworkBackground className="absolute inset-0 h-full w-full opacity-50" />
            <Button variant="ghost" size="icon-sm" className="absolute left-3 top-3 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open cases">
              <Menu className="h-4 w-4" />
            </Button>
            <div className="relative max-w-lg text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary glow-primary">
                <BrainCircuit className="h-8 w-8" />
              </div>
              <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">
                Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}.
              </h1>
              <p className="mt-3 text-muted-foreground">
                Open a case file and {BRAND.assistant} will start building the evidence board as you brief it.
                New here? Run the demo case to see the full workflow.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" onClick={() => setNewCaseOpen(true)}><Plus className="h-4 w-4" /> Open new case</Button>
                <Button size="lg" variant="outline" onClick={startDemo}><FlaskConical className="h-4 w-4" /> Run demo case</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <NewCaseModal open={newCaseOpen} onClose={() => setNewCaseOpen(false)} onCreate={async (d) => { await createCase(d); }} />

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this case?">
        <p className="text-sm text-muted-foreground">
          <b className="text-foreground">{current?.title}</b> and all of its messages, evidence and graph data will be permanently deleted.
          The deletion is recorded in the audit log.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="destructive" onClick={deleteCase}>Delete case</Button>
        </div>
      </Modal>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Reset the evidence graph?">
        <p className="text-sm text-muted-foreground">
          All entities, links, timeline events and the brief for this case will be cleared. Messages and evidence files are kept.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          <Button variant="destructive" onClick={clearGraph}>Reset graph</Button>
        </div>
      </Modal>
    </div>
  );
};
