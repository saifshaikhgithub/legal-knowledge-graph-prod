import {
  Building2, Calendar, Car, Circle, Crosshair, MapPin, MessageSquareText, Package, User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ENTITY_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  Person: { color: '#f43f5e', icon: User },
  Location: { color: '#38bdf8', icon: MapPin },
  Object: { color: '#34d399', icon: Package },
  Event: { color: '#fbbf24', icon: Calendar },
  Organization: { color: '#a78bfa', icon: Building2 },
  Vehicle: { color: '#fb923c', icon: Car },
  Weapon: { color: '#ef4444', icon: Crosshair },
  Communication: { color: '#2dd4bf', icon: MessageSquareText },
  Unknown: { color: '#94a3b8', icon: Circle },
};

export const entityStyle = (type: string) => ENTITY_STYLE[type] || ENTITY_STYLE.Unknown;

export const humanize = (relation: string) => relation.replace(/_/g, ' ');

/** How sure the AI is that a link is supported by the evidence - NOT how suspicious anyone is. */
export const certainty = (c: number | null) => {
  if (c == null) return null;
  if (c >= 0.9) return { label: 'Stated', tone: 'success' as const, hint: 'Directly stated in the evidence' };
  if (c >= 0.55) return { label: 'Implied', tone: 'warning' as const, hint: 'Strongly implied, not stated outright' };
  return { label: 'Speculative', tone: 'neutral' as const, hint: 'Weakly supported - verify before relying on it' };
};

export interface Suspicion {
  score: number;
  role: string;
}

export const suspicionColor = (score: number) =>
  score >= 70 ? '#ef4444' : score >= 40 ? '#f97316' : score >= 15 ? '#f5a524' : '#64748b';

export const formatDate = (iso: string, withTime = false) => {
  if (!iso) return '';
  // Backend timestamps are UTC without a zone suffix.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, withTime
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};

export const timeAgo = (iso: string) => {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(iso);
};
