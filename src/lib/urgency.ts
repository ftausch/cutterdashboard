/**
 * urgency.ts — SLA rules and aging logic for the ops review workflow.
 *
 * Pure functions with no external imports — safe to import from both
 * server-side API routes and "use client" page components.
 */

// ── Types ─────────────────────────────────────────────────────────────
export type UrgencyLevel =
  | 'on_track'
  | 'attention_needed'
  | 'overdue'
  | 'critical_delay';

// Must stay in sync with InboxCategory in /api/ops/inbox/route.ts
export type InboxCategory =
  | 'critical'
  | 'proof_overdue'
  | 'proof_waiting'
  | 'suspicious'
  | 'reupload'
  | 'proof_missing'
  | 'billing_ready'
  | 'blocked';

export interface SlaThresholds {
  attention_h: number;  // → attention_needed
  overdue_h:   number;  // → overdue
  critical_h:  number;  // → critical_delay
  /** Who is blocking progress: 'admin', 'cutter', or 'either' */
  responsible: 'admin' | 'cutter' | 'either';
}

// ── SLA thresholds per category ───────────────────────────────────────
// Tune these to match your actual operational expectations.
const SLA: Record<InboxCategory, SlaThresholds> = {
  // Admin must resolve critical discrepancies quickly
  critical:      { attention_h: 6,   overdue_h: 24,  critical_h: 48,  responsible: 'admin'  },
  // Cutter already missed the 48-h upload window — escalates fast
  proof_overdue: { attention_h: 0,   overdue_h: 24,  critical_h: 72,  responsible: 'cutter' },
  // Admin must review a submitted proof within 8 h
  proof_waiting: { attention_h: 8,   overdue_h: 24,  critical_h: 48,  responsible: 'admin'  },
  // Suspicious discrepancy — needs investigation but less urgent than critical
  suspicious:    { attention_h: 24,  overdue_h: 72,  critical_h: 168, responsible: 'admin'  },
  // Cutter re-upload requested — give them reasonable time
  reupload:      { attention_h: 24,  overdue_h: 72,  critical_h: 120, responsible: 'cutter' },
  // Cutter proof requested, clock running
  proof_missing: { attention_h: 24,  overdue_h: 48,  critical_h: 96,  responsible: 'cutter' },
  // Billing is on us — 3-day attention, 1-week overdue, 2-week critical
  billing_ready: { attention_h: 72,  overdue_h: 168, critical_h: 336, responsible: 'admin'  },
  // Flagged clips need near-immediate attention
  blocked:       { attention_h: 1,   overdue_h: 24,  critical_h: 72,  responsible: 'admin'  },
};

// ── State-start timestamp ─────────────────────────────────────────────
// Returns the ISO timestamp that marks when a clip entered its current category.
// "Hours elapsed since this" = how long we have been waiting.
export function stateStartAt(r: {
  inbox_category:     InboxCategory;
  created_at:         string | null;
  proof_requested_at: string | null;
  proof_uploaded_at:  string | null;
  last_activity_at:   string | null;
}): string | null {
  switch (r.inbox_category) {
    case 'critical':      return r.created_at;
    case 'proof_overdue': return r.proof_requested_at;          // clock started when requested
    case 'proof_waiting': return r.proof_uploaded_at            // clock started when cutter uploaded
                              ?? r.last_activity_at;
    case 'suspicious':    return r.created_at;
    case 'reupload':      return r.last_activity_at;            // when admin requested reupload
    case 'proof_missing': return r.proof_requested_at;
    case 'billing_ready': return r.last_activity_at;            // proxy for when it became billable
    case 'blocked':       return r.last_activity_at;            // when it was flagged
  }
}

// ── Hours elapsed since a timestamp ──────────────────────────────────
export function hoursElapsed(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
}

// ── Classify urgency ──────────────────────────────────────────────────
export function classifyUrgency(
  category: InboxCategory,
  stateAgeHours: number,
): UrgencyLevel {
  const s = SLA[category];
  if (stateAgeHours >= s.critical_h)  return 'critical_delay';
  if (stateAgeHours >= s.overdue_h)   return 'overdue';
  if (stateAgeHours >= s.attention_h) return 'attention_needed';
  return 'on_track';
}

// ── Priority score bonus driven by urgency ────────────────────────────
export function urgencyBonus(level: UrgencyLevel): number {
  switch (level) {
    case 'critical_delay':   return 40;
    case 'overdue':          return 20;
    case 'attention_needed': return 8;
    default:                 return 0;
  }
}

// ── SLA thresholds for a category ────────────────────────────────────
export function getSla(category: InboxCategory): SlaThresholds {
  return SLA[category];
}

// ── Display config ────────────────────────────────────────────────────
export const URGENCY_CFG: Record<UrgencyLevel, {
  label:   string;
  badge:   string;   // Tailwind classes for a small badge
  dot:     string;   // Tailwind classes for an indicator dot
  ageCls:  string;   // Tailwind class for the age number itself
  rowCls:  string;   // Optional extra row background
}> = {
  on_track: {
    label:  'Im Plan',
    badge:  'bg-muted/30 text-muted-foreground/50 border-border',
    dot:    'bg-muted-foreground/25',
    ageCls: 'text-muted-foreground/50',
    rowCls: '',
  },
  attention_needed: {
    label:  'Aufmerksamkeit',
    badge:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    dot:    'bg-yellow-400',
    ageCls: 'text-yellow-400',
    rowCls: '',
  },
  overdue: {
    label:  'Überfällig',
    badge:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
    dot:    'bg-orange-400',
    ageCls: 'text-orange-400 font-semibold',
    rowCls: '',
  },
  critical_delay: {
    label:  'Kritisch verzögert',
    badge:  'bg-red-500/15 text-red-400 border-red-500/25',
    dot:    'bg-red-500 animate-pulse',
    ageCls: 'text-red-400 font-bold',
    rowCls: 'bg-red-500/[0.03]',
  },
};

// ── Format state age for display ──────────────────────────────────────
export function fmtStateAge(hours: number): string {
  if (hours < 1)  return '<1h';
  if (hours < 24) return `${Math.floor(hours)}h`;
  const d = Math.floor(hours / 24);
  if (d === 1)    return '1 Tag';
  if (d < 7)      return `${d} Tage`;
  const w = Math.floor(d / 7);
  if (w === 1)    return '1 Woche';
  return `${w} Wochen`;
}

// ── Category assignment ───────────────────────────────────────────────
// Pure client-safe version of the server-side assignCategory.
// Used by the clip detail page and inbox page to derive categories locally.
export function assignCategory(r: {
  is_flagged:          number | null;
  proof_status:        string | null;
  proof_requested_at:  string | null;
  discrepancy_status:  string | null;
  verification_status: string | null;
  unbilled_views:      number;
}): InboxCategory {
  if (r.is_flagged) return 'blocked';
  const approved = r.proof_status === 'proof_approved';
  if (r.discrepancy_status === 'critical_difference' && !approved) return 'critical';
  if (r.proof_status === 'proof_requested' && r.proof_requested_at) {
    const h = (Date.now() - new Date(r.proof_requested_at).getTime()) / 3_600_000;
    if (h >= 48) return 'proof_overdue';
  }
  if (r.proof_status === 'proof_submitted' || r.proof_status === 'proof_under_review') return 'proof_waiting';
  if (r.discrepancy_status === 'suspicious_difference' && !approved) return 'suspicious';
  if (r.proof_status === 'proof_requested') return 'proof_missing';
  if (r.proof_status === 'proof_reupload_requested') return 'reupload';
  if (
    (r.verification_status === 'verified' || r.verification_status === 'manual_proof') &&
    r.unbilled_views > 0
  ) return 'billing_ready';
  return 'billing_ready';
}

// ── Next-SLA threshold label ──────────────────────────────────────────
// Shows how long until the item escalates to the next urgency level.
export function nextSlaIn(category: InboxCategory, stateAgeHours: number): string | null {
  const s = SLA[category];
  if (stateAgeHours < s.attention_h) {
    const rem = s.attention_h - stateAgeHours;
    return `Aufmerksamkeit in ${fmtStateAge(rem)}`;
  }
  if (stateAgeHours < s.overdue_h) {
    const rem = s.overdue_h - stateAgeHours;
    return `Überfällig in ${fmtStateAge(rem)}`;
  }
  if (stateAgeHours < s.critical_h) {
    const rem = s.critical_h - stateAgeHours;
    return `Kritisch in ${fmtStateAge(rem)}`;
  }
  return null; // already at critical
}
