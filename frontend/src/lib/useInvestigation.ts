import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ChatMessage, type GraphChanges, type GraphStats } from './api';

export type Stage = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'thinking' | 'writing';

interface Options {
  caseId: number | null;
  onGraphChanged: (stats: GraphStats) => void;
  onEvidenceAdded: () => void;
}

/**
 * Conversation state for one case: history, streaming replies, evidence attachments.
 * Lives above the tab views so a reply keeps streaming while the investigator looks at the graph.
 */
export function useInvestigation({ caseId, onGraphChanged, onEvidenceAdded }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [uploadNote, setUploadNote] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const callbacks = useRef({ onGraphChanged, onEvidenceAdded });

  useEffect(() => {
    callbacks.current = { onGraphChanged, onEvidenceAdded };
  }, [onGraphChanged, onEvidenceAdded]);

  useEffect(() => {
    abortRef.current?.abort();
    setStage('idle');
    setMessages([]);
    if (!caseId) return;
    let cancelled = false;
    setLoadingHistory(true);
    api.getCase(caseId)
      .then((detail) => {
        if (!cancelled) {
          setMessages(detail.messages.map((m) => ({ id: m.id, role: m.role as ChatMessage['role'], content: m.content, created_at: m.created_at })));
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => { cancelled = true; };
  }, [caseId]);

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));

  const send = useCallback(async (text: string, files: File[] = []) => {
    if (!caseId || stage !== 'idle') return;
    const evidenceIds: number[] = [];
    let changes: GraphChanges | undefined;

    if (files.length) {
      setStage('uploading');
      for (const [i, file] of files.entries()) {
        setUploadNote(`Processing ${file.name} (${i + 1}/${files.length})`);
        try {
          const res = await api.uploadEvidence(caseId, file);
          evidenceIds.push(res.evidence.id);
          changes = res.changes;
          callbacks.current.onGraphChanged(res.stats);
        } catch (e) {
          setMessages((prev) => [...prev, { role: 'assistant', content: '', error: `Could not process ${file.name}: ${(e as Error).message}` }]);
        }
      }
      setUploadNote('');
      callbacks.current.onEvidenceAdded();
      if (!evidenceIds.length) {
        setStage('idle');
        return;
      }
    }

    const names = files.map((f) => f.name).join(', ');
    const message = text.trim() || `New evidence added: ${names}. Analyse it against the case so far - what does it change?`;
    const shown = files.length ? `${message}\n\n📎 ${names}` : message;

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: shown },
      { role: 'assistant', content: '', reasoning: '', pending: true, graphDelta: changes },
    ]);
    setStage('extracting');

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.streamChat(caseId, message, evidenceIds, (event) => {
        switch (event.type) {
          case 'status':
            setStage(event.stage);
            break;
          case 'graph':
            callbacks.current.onGraphChanged(event.stats);
            patchLast((m) => ({ ...m, graphDelta: mergeChanges(m.graphDelta, event.changes) }));
            break;
          case 'reasoning':
            setStage('thinking');
            patchLast((m) => ({ ...m, reasoning: (m.reasoning || '') + event.text }));
            break;
          case 'token':
            setStage('writing');
            patchLast((m) => ({ ...m, content: m.content + event.text }));
            break;
          case 'error':
            patchLast((m) => ({ ...m, error: event.message }));
            break;
          case 'done':
            patchLast((m) => ({ ...m, id: event.message_id ?? undefined, pending: false }));
            break;
        }
      }, controller.signal);
    } catch (e) {
      patchLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      patchLast((m) => ({ ...m, pending: false }));
      abortRef.current = null;
      setStage('idle');
    }
  }, [caseId, stage]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, loadingHistory, stage, uploadNote, send, stop, busy: stage !== 'idle' };
}

function mergeChanges(a: GraphChanges | undefined, b: GraphChanges): GraphChanges {
  if (!a) return b;
  return {
    entities_added: a.entities_added + b.entities_added,
    entities_updated: a.entities_updated + b.entities_updated,
    relations_added: a.relations_added + b.relations_added,
    events_added: a.events_added + b.events_added,
  };
}
