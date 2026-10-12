import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Combine, Crosshair, LayoutGrid, Loader2, Maximize2, MessageSquarePlus, Network, Pause, Play, Search, Tag, Trash2, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { ENTITY_STYLE, certainty, entityStyle, humanize, suspicionColor, type Suspicion } from '../../lib/entity';
import { useTheme } from '../../lib/ThemeContext';
import { api, type GraphData, type GraphEdge, type GraphNode } from '../../lib/api';
import { layoutFor, type Camera } from '../../lib/layoutCache';

type FNode = NodeObject<GraphNode & { r: number }>;
type FLink = LinkObject<FNode, GraphEdge & { curvature: number }>;

interface Props {
  caseId: number;
  data: GraphData | null;
  /** Suspicion scores and roles from the latest case brief, keyed by lower-cased name. */
  suspicion?: Record<string, Suspicion>;
  loading: boolean;
  onMerge: (keep: string, merge: string) => Promise<void>;
  onRetype: (name: string, type: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
  onAsk: (question: string) => void;
  focusRequest?: { id: string; n: number } | null;
}

const endId = (end: unknown) => (typeof end === 'object' && end ? (end as FNode).id as string : end as string);

/** Batches layout changes into one request a moment after the investigator stops moving things. */
function useLayoutSaver(caseId: number) {
  const pending = useRef<Record<string, [number, number] | null>>({});
  const camera = useRef<Camera | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const positions = pending.current;
    const cam = camera.current;
    pending.current = {};
    camera.current = null;
    if (Object.keys(positions).length || cam) api.saveLayout(caseId, positions, cam).catch(() => {});
  }, [caseId]);

  const queue = useCallback((positions: Record<string, [number, number] | null>, cam?: Camera) => {
    Object.assign(pending.current, positions);
    if (cam) camera.current = cam;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 800);
  }, [flush]);

  useEffect(() => flush, [flush]); // save anything outstanding when the board closes
  return queue;
}

export const GraphView = ({ caseId, data, suspicion = {}, loading, onMerge, onRetype, onDelete, onAsk, focusRequest }: Props) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<FNode, FLink>>(undefined);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [working, setWorking] = useState(false);
  const cameraRestored = useRef(false);
  const cameraTimer = useRef<number | undefined>(undefined);
  const saveLayout = useLayoutSaver(caseId);

  // Remember the current view (centre in graph coordinates + zoom). Read straight from the graph once
  // any pan / zoom / camera transition has settled, rather than trusting individual zoom events.
  const captureCamera = useCallback(() => {
    const fg = fgRef.current;
    const entry = layoutFor(caseId);
    if (!fg || (!cameraRestored.current && entry.camera)) return; // a saved view is still being restored
    const centre = fg.centerAt() as unknown as { x: number; y: number };
    const cam = { k: Math.round(fg.zoom() * 1000) / 1000, x: Math.round(centre.x * 10) / 10, y: Math.round(centre.y * 10) / 10 };
    if (!Number.isFinite(cam.k) || !Number.isFinite(cam.x) || !Number.isFinite(cam.y)) return;
    if (entry.camera && entry.camera.k === cam.k && entry.camera.x === cam.x && entry.camera.y === cam.y) return;
    entry.camera = cam;
    saveLayout({}, cam);
  }, [caseId, saveLayout]);

  const captureCameraSoon = useCallback(() => {
    window.clearTimeout(cameraTimer.current);
    cameraTimer.current = window.setTimeout(captureCamera, 700);
  }, [captureCamera]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build force-graph data. Nodes with a saved position are pinned there (fx/fy), so the board looks
  // exactly as the investigator left it; only brand-new entities are placed by the physics.
  const graph = useMemo(() => {
    if (!data) return { nodes: [] as FNode[], links: [] as FLink[] };
    const saved = layoutFor(caseId, data.layout).positions;
    const nodes: FNode[] = data.nodes
      .filter((n) => !hidden.has(n.type))
      .map((n) => {
        const p = saved.get(n.id);
        return { ...n, r: 4 + Math.min(10, Math.sqrt(n.degree + n.mentions) * 1.8), ...(p && { x: p.x, y: p.y, fx: p.x, fy: p.y }) };
      });
    const ids = new Set(nodes.map((n) => n.id as string));
    const pairCount = new Map<string, number>();
    const pairIndex = new Map<string, number>();
    const visible = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    for (const e of visible) {
      const key = [e.source, e.target].sort().join('\u0000');
      pairCount.set(key, (pairCount.get(key) || 0) + 1);
    }
    const links: FLink[] = visible.map((e) => {
      const key = [e.source, e.target].sort().join('\u0000');
      const n = pairCount.get(key) || 1;
      const i = pairIndex.get(key) || 0;
      pairIndex.set(key, i + 1);
      const dir = e.source < e.target ? 1 : -1;
      return { ...e, curvature: n === 1 ? 0 : dir * (i - (n - 1) / 2) * 0.35 };
    });
    return { nodes, links };
  }, [caseId, data, hidden]);

  // Put the camera back where it was; only frame the whole board when there is nothing to restore.
  useEffect(() => {
    if (cameraRestored.current || !graph.nodes.length) return;
    const cam = layoutFor(caseId).camera;
    if (!cam) return;
    const id = window.requestAnimationFrame(() => {
      fgRef.current?.zoom(cam.k, 0);
      fgRef.current?.centerAt(cam.x, cam.y, 0);
      cameraRestored.current = true;
    });
    return () => window.cancelAnimationFrame(id);
  }, [caseId, graph]);

  const rememberPositions = (nodes: FNode[]) => {
    const entry = layoutFor(caseId);
    const changed: Record<string, [number, number]> = {};
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      const prev = entry.positions.get(n.id as string);
      if (!prev || Math.abs(prev.x - n.x) > 0.5 || Math.abs(prev.y - n.y) > 0.5) {
        entry.positions.set(n.id as string, { x: n.x, y: n.y });
        changed[n.id as string] = [n.x, n.y];
      }
      n.fx = n.x; // pin, so a later reheat (new evidence arriving) never rearranges the board
      n.fy = n.y;
    }
    if (Object.keys(changed).length) saveLayout(changed);
  };

  const resetLayout = () => {
    const entry = layoutFor(caseId);
    const cleared: Record<string, null> = {};
    for (const id of entry.positions.keys()) cleared[id] = null;
    entry.positions.clear();
    for (const n of graph.nodes) { n.fx = undefined; n.fy = undefined; }
    saveLayout(cleared);
    cameraRestored.current = true;
    entry.camera = null;
    fgRef.current?.d3ReheatSimulation();
  };

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of data?.edges || []) {
      if (!map.has(l.source)) map.set(l.source, new Set());
      if (!map.has(l.target)) map.set(l.target, new Set());
      map.get(l.source)!.add(l.target);
      map.get(l.target)!.add(l.source);
    }
    return map;
  }, [data]);

  const focus = selected || hovered;
  const isLit = useCallback((id: string) => !focus || id === focus || !!neighbors.get(focus)?.has(id), [focus, neighbors]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-260);
    fg.d3Force('link')?.distance(90);
  }, [graph]);

  useEffect(() => {
    if (selected && !data?.nodes.some((n) => n.id === selected)) setSelected(null);
  }, [data, selected]);

  useEffect(() => {
    if (focusRequest) setSelected(focusRequest.id);
  }, [focusRequest]);

  const colors = theme === 'dark'
    ? { label: 'rgba(226,232,240,0.92)', dim: 'rgba(148,163,184,0.35)', link: 'rgba(148,163,184,0.28)', linkLit: 'rgba(245,165,36,0.9)', bg: '#06080c' }
    : { label: 'rgba(15,23,42,0.9)', dim: 'rgba(71,85,105,0.35)', link: 'rgba(71,85,105,0.3)', linkLit: 'rgba(217,119,6,0.95)', bg: '#f8f7f3' };

  const drawNode = useCallback((node: FNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const id = node.id as string;
    const lit = isLit(id);
    const color = entityStyle(node.type).color;
    const x = node.x || 0, y = node.y || 0;
    ctx.globalAlpha = lit ? 1 : 0.12;

    if (id === focus || (lit && focus)) {
      ctx.beginPath();
      ctx.arc(x, y, node.r + (id === focus ? 6 : 3), 0, 2 * Math.PI);
      ctx.fillStyle = `${color}33`;
      ctx.fill();
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = id === focus ? 24 : 10;
    ctx.beginPath();
    ctx.arc(x, y, node.r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = theme === 'dark' ? 'rgba(6,8,12,0.9)' : 'rgba(255,255,255,0.9)';
    ctx.stroke();

    // Brief overlay: dashed ring marks the victim, a coloured ring shows suspicion for persons of interest.
    const s = suspicion[node.label.toLowerCase()];
    if (s) {
      ctx.beginPath();
      ctx.arc(x, y, node.r + 3.5 / scale + 1.5, 0, 2 * Math.PI);
      if (s.role === 'victim') {
        ctx.setLineDash([3 / scale, 2 / scale]);
        ctx.strokeStyle = theme === 'dark' ? 'rgba(226,232,240,0.85)' : 'rgba(15,23,42,0.75)';
        ctx.lineWidth = 1.5 / scale;
      } else if (s.score >= 15) {
        ctx.strokeStyle = suspicionColor(s.score);
        ctx.lineWidth = (1.5 + (s.score / 100) * 2.5) / scale;
      } else {
        ctx.lineWidth = 0;
      }
      if (ctx.lineWidth) ctx.stroke();
      ctx.setLineDash([]);
    }

    if (scale > 0.55 || id === focus || node.degree >= 4) {
      const fontSize = Math.max(11 / scale, 2.5);
      ctx.font = `${id === focus ? 600 : 500} ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
      ctx.lineWidth = 3 / scale;
      ctx.strokeStyle = colors.bg;
      ctx.strokeText(label, x, y + node.r + 3 / scale);
      ctx.fillStyle = lit ? colors.label : colors.dim;
      ctx.fillText(label, x, y + node.r + 3 / scale);
    }
    ctx.globalAlpha = 1;
  }, [isLit, focus, theme, suspicion, colors.bg, colors.label, colors.dim]);

  const drawLinkLabel = useCallback((link: FLink, ctx: CanvasRenderingContext2D, scale: number) => {
    const s = link.source as FNode, t = link.target as FNode;
    if (!focus || (s.id !== focus && t.id !== focus) || s.x == null || t.x == null) return;
    const mx = (s.x + (t.x || 0)) / 2, my = ((s.y || 0) + (t.y || 0)) / 2;
    const dx = (t.x || 0) - s.x, dy = (t.y || 0) - (s.y || 0);
    const off = link.curvature * Math.hypot(dx, dy) / 2;
    const len = Math.hypot(dx, dy) || 1;
    const lx = mx + (dy / len) * off, ly = my - (dx / len) * off;
    const text = humanize(link.label);
    const fontSize = Math.max(10 / scale, 2);
    ctx.font = `500 ${fontSize}px 'JetBrains Mono', monospace`;
    const w = ctx.measureText(text).width + 8 / scale;
    ctx.fillStyle = theme === 'dark' ? 'rgba(13,17,23,0.92)' : 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = colors.linkLit;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - fontSize * 0.8, w, fontSize * 1.6, 3 / scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.linkLit;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx, ly);
  }, [focus, theme, colors.linkLit]);

  const selectedNode = data?.nodes.find((n) => n.id === selected) || null;
  const connections = useMemo(() => (data?.edges || []).filter((e) => e.source === selected || e.target === selected), [data, selected]);

  const zoomTo = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (node?.x != null && node.y != null) {
      fgRef.current?.centerAt(node.x, node.y, 600);
      fgRef.current?.zoom(2.2, 600);
      captureCameraSoon();
    }
    setSelected(id);
  };

  const searchHits = query.trim()
    ? (data?.nodes || []).filter((n) => [n.label, ...n.aliases].some((s) => s.toLowerCase().includes(query.toLowerCase()))).slice(0, 6)
    : [];

  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    try { await fn(); } finally { setWorking(false); }
  };

  if (!loading && data && data.nodes.length === 0) {
    return (
      <div className="grid h-full place-items-center grid-bg">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Network className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-display text-xl font-semibold">The evidence board is empty</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Describe the case or upload statements in Investigate. People, places, vehicles and links appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0">
      <div
        ref={containerRef}
        className="relative min-w-0 flex-1 overflow-hidden grid-bg"
        onWheel={captureCameraSoon}
        onPointerUp={captureCameraSoon}
      >
        {loading && !data && (
          <div className="absolute inset-0 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        )}
        {data && (
          <ForceGraph2D<FNode, FLink>
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graph}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeRelSize={1}
            nodeVal={(n) => n.r * n.r}
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x || 0, node.y || 0, node.r + 4, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkCurvature="curvature"
            linkColor={(l) => (focus && (endId(l.source) === focus || endId(l.target) === focus) ? colors.linkLit : focus ? 'rgba(148,163,184,0.06)' : colors.link)}
            linkWidth={(l) => (focus && (endId(l.source) === focus || endId(l.target) === focus) ? 2 : 1)}
            linkDirectionalArrowLength={4.5}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={(l) => (focus && (endId(l.source) === focus || endId(l.target) === focus) ? 3 : 0)}
            linkDirectionalParticleWidth={2.2}
            linkDirectionalParticleColor={() => colors.linkLit}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={drawLinkLabel}
            onNodeHover={(n) => setHovered((n?.id as string) || null)}
            onNodeClick={(n) => setSelected((s) => (s === n.id ? null : (n.id as string)))}
            onBackgroundClick={() => setSelected(null)}
            onNodeDragEnd={(n) => rememberPositions([n])}
            onEngineStop={() => {
              rememberPositions(graph.nodes);
              if (!cameraRestored.current && !layoutFor(caseId).camera) {
                cameraRestored.current = true;
                fgRef.current?.zoomToFit(500, 70);
                captureCameraSoon();
              }
            }}
            onZoomEnd={captureCameraSoon}
            cooldownTicks={frozen ? 0 : 160}
            d3VelocityDecay={0.32}
            enableNodeDrag
          />
        )}

        {/* Toolbar */}
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-2 sm:left-4 sm:top-4">
          <div className="relative w-64 max-w-[calc(100vw-2rem)]">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find entity…"
              className="h-9 w-full rounded-lg border glass pl-8 pr-3 text-sm placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none"
            />
            {searchHits.length > 0 && (
              <div className="absolute inset-x-0 top-10 overflow-hidden rounded-lg border bg-popover shadow-xl">
                {searchHits.map((n) => {
                  const s = entityStyle(n.type);
                  return (
                    <button key={n.id} onClick={() => { zoomTo(n.id); setQuery(''); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-3">
                      <s.icon className="h-3.5 w-3.5" style={{ color: s.color }} /> {n.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="absolute right-3 top-3 z-10 flex gap-1.5 sm:right-4 sm:top-4">
          <Button variant="outline" size="icon-sm" className="glass" title="Fit to view" aria-label="Fit to view" onClick={() => { fgRef.current?.zoomToFit(600, 60); captureCameraSoon(); }}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline" size="icon-sm" className="glass"
            title="Re-arrange automatically (forgets your saved layout)" aria-label="Re-arrange layout"
            onClick={() => { if (confirm('Forget your arrangement and let the board lay itself out again?')) resetLayout(); }}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="outline" size="icon-sm" className="glass"
            title={frozen ? 'Resume layout' : 'Freeze layout'} aria-label="Toggle layout physics"
            onClick={() => { setFrozen((f) => !f); if (frozen) fgRef.current?.d3ReheatSimulation(); }}
          >
            {frozen ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
        </div>

        {/* Legend / filters */}
        <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap gap-1.5 sm:bottom-4 sm:left-4">
          {Object.entries(data?.stats.by_type || {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
            const s = ENTITY_STYLE[type] || ENTITY_STYLE.Unknown;
            const off = hidden.has(type);
            return (
              <button
                key={type}
                onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(type)) n.delete(type); else n.add(type); return n; })}
                className={cn('flex items-center gap-1.5 rounded-md border glass px-2 py-1 font-mono text-[10.5px] transition-opacity', off && 'opacity-40 line-through')}
                title={off ? `Show ${type}` : `Hide ${type}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                {type} <span className="text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inspector */}
      <AnimatePresence>
        {selectedNode && (
          <motion.aside
            key={selectedNode.id}
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[360px] flex-col border-l bg-surface/95 backdrop-blur-xl md:static"
          >
            {(() => {
              const s = entityStyle(selectedNode.type);
              return (
                <div className="border-b p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border" style={{ borderColor: `${s.color}55`, background: `${s.color}18`, color: s.color }}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="Close inspector"><X className="h-4 w-4" /></Button>
                  </div>
                  <h3 className="mt-3 font-display text-xl font-semibold leading-tight">{selectedNode.label}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <select
                      value={selectedNode.type}
                      disabled={working}
                      onChange={(e) => run(() => onRetype(selectedNode.id, e.target.value))}
                      className="h-6 rounded-md border bg-surface-2 px-1.5 font-mono text-[10.5px] uppercase tracking-wider focus:outline-none"
                      aria-label="Entity type"
                    >
                      {[...new Set([...(data?.entity_types || []), selectedNode.type])].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Badge>{selectedNode.degree} links</Badge>
                    <Badge>{selectedNode.mentions}× mentioned</Badge>
                  </div>
                  {selectedNode.description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{selectedNode.description}</p>}
                  {(() => {
                    const sus = suspicion[selectedNode.label.toLowerCase()];
                    const role = sus?.role || String(selectedNode.attributes.role || '');
                    if (sus?.role === 'victim' || /victim|deceased/i.test(role)) {
                      return (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Role</span>
                          <span className="font-semibold">Victim</span>
                          <span className="ml-auto text-xs text-muted-foreground">not a suspect</span>
                        </div>
                      );
                    }
                    if (!sus) return null;
                    return (
                      <div className="mt-4 rounded-lg border px-3 py-2.5" title="From the latest Case Brief">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono uppercase tracking-wider text-muted-foreground">Suspicion · {sus.role}</span>
                          <span className="font-mono text-sm font-semibold" style={{ color: suspicionColor(sus.score) }}>{sus.score}/100</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${sus.score}%`, background: suspicionColor(sus.score) }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {selectedNode.aliases.length > 0 && (
                <div>
                  <div className="label-mono mb-2 flex items-center gap-1.5"><Tag className="h-3 w-3" /> Also known as</div>
                  <div className="flex flex-wrap gap-1.5">{selectedNode.aliases.map((a) => <Badge key={a} tone="neutral" className="normal-case tracking-normal">{a}</Badge>)}</div>
                </div>
              )}
              {Object.keys(selectedNode.attributes).length > 0 && (
                <div>
                  <div className="label-mono mb-2">Attributes</div>
                  <dl className="divide-y rounded-lg border">
                    {Object.entries(selectedNode.attributes).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[100px_1fr] gap-2 px-3 py-2 text-sm">
                        <dt className="font-mono text-[11px] uppercase text-muted-foreground">{humanize(k)}</dt>
                        <dd className="break-words">{Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div>
                <div className="label-mono mb-2" title="Stated / Implied / Speculative = how well the evidence supports each link">
                  Connections · {connections.length}
                </div>
                <div className="space-y-2">
                  {connections.map((e) => {
                    const outgoing = e.source === selectedNode.id;
                    const other = outgoing ? e.target : e.source;
                    const otherNode = data?.nodes.find((n) => n.id === other);
                    const os = entityStyle(otherNode?.type || 'Unknown');
                    return (
                      <div key={e.id} className="rounded-lg border bg-surface-2/50 p-2.5">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-mono text-[11px] text-primary">{outgoing ? '' : '← '}{humanize(e.label)}{outgoing ? ' →' : ''}</span>
                          <button onClick={() => zoomTo(other)} className="flex min-w-0 items-center gap-1 font-medium hover:underline">
                            <os.icon className="h-3 w-3 shrink-0" style={{ color: os.color }} /><span className="truncate">{other}</span>
                          </button>
                        </div>
                        {(e.time || e.confidence != null) && (
                          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
                            {(() => {
                              const c = certainty(e.confidence);
                              return c && <Badge tone={c.tone} title={`${c.hint}. This is about the link, not about guilt.`}>{c.label}</Badge>;
                            })()}
                            {e.time && <span>@ {e.time}</span>}
                          </div>
                        )}
                        {e.evidence[0] && <p className="mt-1.5 border-l-2 border-ai/40 pl-2 text-xs italic text-muted-foreground">“{e.evidence[0]}”</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 border-t pt-5">
                <div className="label-mono mb-2">Investigator actions</div>
                <Button variant="ai" size="sm" className="w-full" onClick={() => onAsk(`What do we know about ${selectedNode.label}? Assess their role in the case and any inconsistencies.`)}>
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Ask {`analyst about this ${selectedNode.type.toLowerCase()}`}
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => zoomTo(selectedNode.id)}>
                  <Crosshair className="h-3.5 w-3.5" /> Center on board
                </Button>
                <div className="flex gap-2">
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="h-8 min-w-0 flex-1 rounded-lg border bg-surface-2 px-2 text-xs focus:outline-none"
                    aria-label="Duplicate entity to merge"
                  >
                    <option value="">Merge a duplicate into this…</option>
                    {data?.nodes.filter((n) => n.id !== selectedNode.id).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                  <Button
                    size="sm" variant="outline" disabled={!mergeTarget || working}
                    onClick={() => run(async () => { await onMerge(selectedNode.id, mergeTarget); setMergeTarget(''); })}
                  >
                    <Combine className="h-3.5 w-3.5" /> Merge
                  </Button>
                </div>
                <Button
                  variant="ghost" size="sm" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={working}
                  onClick={() => { if (confirm(`Remove "${selectedNode.label}" and its links from the board?`)) run(() => onDelete(selectedNode.id)); }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove from board
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};
