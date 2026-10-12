import { motion } from 'framer-motion';
import { Clock3, Loader2 } from 'lucide-react';
import { entityStyle } from '../../lib/entity';
import type { GraphNode, TimelineEvent } from '../../lib/api';

interface Props {
  events: TimelineEvent[] | null;
  nodes: GraphNode[];
  onEntity: (name: string) => void;
}

export const TimelineView = ({ events, nodes, onEntity }: Props) => {
  if (!events) {
    return <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!events.length) {
    return (
      <div className="grid h-full place-items-center grid-bg">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Clock3 className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-display text-xl font-semibold">No events on the timeline</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Mention times and dates ("at 23:10 on March 12, the guard saw…") and they will be placed here in order.
          </p>
        </div>
      </div>
    );
  }

  const typeOf = (name: string) => nodes.find((n) => n.id === name)?.type || 'Unknown';
  const dated = events.filter((e) => e.sort_key).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="label-mono mb-1 !text-primary">Chronology</div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Case timeline</h2>
          </div>
          <div className="text-right font-mono text-xs text-muted-foreground">
            {events.length} events · {dated} precisely dated
          </div>
        </div>

        <ol className="relative">
          <span className="absolute bottom-2 left-[7px] top-2 w-px bg-gradient-to-b from-primary/70 via-border to-transparent sm:left-[147px]" />
          {events.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.6) }}
              className="relative mb-6 grid gap-1 pl-7 sm:grid-cols-[130px_1fr] sm:gap-6 sm:pl-0"
            >
              <div className="font-mono text-[12px] font-medium text-primary sm:pt-3 sm:text-right">{e.time}</div>
              <span className={`absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-background sm:left-[140px] sm:top-3.5 ${e.sort_key ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary))]' : 'bg-muted-foreground/50'}`} />
              <div className="rounded-xl border bg-surface/70 p-4 transition-colors hover:border-primary/30 sm:ml-4">
                <p className="text-[14.5px] leading-relaxed">{e.description}</p>
                {e.entities.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {e.entities.map((name) => {
                      const s = entityStyle(typeOf(name));
                      return (
                        <button
                          key={name}
                          onClick={() => onEntity(name)}
                          className="flex items-center gap-1 rounded-md border bg-surface-2 px-1.5 py-0.5 text-[11.5px] hover:border-primary/40"
                        >
                          <s.icon className="h-3 w-3" style={{ color: s.color }} /> {name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
};
