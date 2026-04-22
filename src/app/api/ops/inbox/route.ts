import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import {
  stateStartAt, hoursElapsed, classifyUrgency, urgencyBonus,
  type UrgencyLevel,
} from '@/lib/urgency';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map(a =>
              a === null
                ? { type: 'null' }
                : typeof a === 'number'
                ? { type: 'integer', value: String(Math.round(a)) }
                : { type: 'text', value: String(a) }
            ),
          },
        },
        { type: 'close' },
      ],
    }),
  });
  const data   = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result ?? { rows: [], cols: [] };
}

function val(cell: unknown): string | null {
  if (cell == null) return null;
  const c = cell as { value: string | null };
  return c.value ?? null;
}
function intVal(cell: unknown): number | null {
  const v = val(cell);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}
function floatVal(cell: unknown): number | null {
  const v = val(cell);
  if (v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ── Inbox category ───────────────────────────────────────────────────
// Each inbox item lands in exactly one category (priority order).
// The category determines which tab it appears under and drives the
// suggested action.
export type InboxCategory =
  | 'critical'        // critical discrepancy, proof not approved
  | 'proof_overdue'   // proof requested > 48 h, still no submission
  | 'proof_waiting'   // proof submitted or under_review — admin must act
  | 'suspicious'      // suspicious discrepancy, proof not approved
  | 'reupload'        // proof_reupload_requested — waiting for cutter
  | 'proof_missing'   // proof_requested < 48 h (clock running)
  | 'billing_ready'   // verified/manual_proof, has unbilled views
  | 'blocked';        // is_flagged

export type SuggestedAction =
  | 'review_proof'
  | 'request_proof'
  | 'approve_proof'
  | 'investigate'
  | 'bill'
  | 'wait_reupload'
  | 'unflag';

export interface InboxItem {
  id:                  string;
  cutter_id:           string | null;
  cutter_name:         string | null;
  platform:            string | null;
  url:                 string | null;
  title:               string | null;
  claimed_views:       number | null;
  current_views:       number | null;
  unbilled_views:      number;
  verification_status: string | null;
  discrepancy_status:  string | null;
  discrepancy_percent: number | null;
  is_flagged:          number;
  proof_status:        string | null;
  proof_requested_at:  string | null;
  proof_uploaded_at:   string | null;
  created_at:          string | null;
  last_activity_at:    string | null;
  inbox_category:      InboxCategory;
  state_age_hours:     number;
  urgency:             UrgencyLevel;
  priority_score:      number;
  suggested_action:    SuggestedAction;
}

// ── Category assignment ──────────────────────────────────────────────
function assignCategory(
  r: Omit<InboxItem, 'inbox_category' | 'state_age_hours' | 'urgency' | 'priority_score' | 'suggested_action'>
): InboxCategory {
  // Flagged clips always go to blocked
  if (r.is_flagged) return 'blocked';

  const approved = r.proof_status === 'proof_approved';

  // Critical discrepancy without approved proof
  if (r.discrepancy_status === 'critical_difference' && !approved)
    return 'critical';

  // Proof was requested but cutter hasn't uploaded after 48 h
  if (r.proof_status === 'proof_requested' && r.proof_requested_at) {
    const h = (Date.now() - new Date(r.proof_requested_at).getTime()) / 3_600_000;
    if (h >= 48) return 'proof_overdue';
  }

  // Proof submitted or under review — admin needs to act
  if (r.proof_status === 'proof_submitted' || r.proof_status === 'proof_under_review')
    return 'proof_waiting';

  // Suspicious discrepancy without approved proof
  if (r.discrepancy_status === 'suspicious_difference' && !approved)
    return 'suspicious';

  // Proof requested, clock still running
  if (r.proof_status === 'proof_requested') return 'proof_missing';

  // Cutter asked to re-upload
  if (r.proof_status === 'proof_reupload_requested') return 'reupload';

  // Verified with unbilled views
  if (
    (r.verification_status === 'verified' || r.verification_status === 'manual_proof') &&
    r.unbilled_views > 0
  ) return 'billing_ready';

  return 'billing_ready'; // fallback (shouldn't reach here given WHERE clause)
}

// ── Priority score ───────────────────────────────────────────────────
function calcPriority(
  r: Omit<InboxItem, 'inbox_category' | 'state_age_hours' | 'urgency' | 'priority_score' | 'suggested_action'>
): number {
  let s = 0;

  if (r.is_flagged) s += 35;
  if (r.discrepancy_status === 'critical_difference')    s += 40;
  else if (r.discrepancy_status === 'suspicious_difference') s += 20;

  // Proof overdue age bonus
  if (r.proof_status === 'proof_requested' && r.proof_requested_at) {
    const h = (Date.now() - new Date(r.proof_requested_at).getTime()) / 3_600_000;
    if (h > 72) s += 40;
    else if (h > 48) s += 30;
    else if (h > 24) s += 10;
  }

  if (r.proof_status === 'proof_submitted' || r.proof_status === 'proof_under_review') s += 25;
  if (r.proof_status === 'proof_reupload_requested') s += 15;

  // Unbilled view scale
  if (r.unbilled_views > 1_000_000)    s += 25;
  else if (r.unbilled_views > 100_000) s += 10;

  // Clip age
  if (r.created_at) {
    const d = (Date.now() - new Date(r.created_at).getTime()) / 86_400_000;
    if (d > 30) s += 20;
    else if (d > 14) s += 8;
  }

  return s;
}

// ── Suggested action ─────────────────────────────────────────────────
function suggestAction(cat: InboxCategory, r: Omit<InboxItem, 'inbox_category' | 'state_age_hours' | 'urgency' | 'priority_score' | 'suggested_action'>): SuggestedAction {
  switch (cat) {
    case 'blocked':       return 'unflag';
    case 'critical':      return 'request_proof';
    case 'proof_overdue': return 'request_proof';
    case 'proof_waiting': return 'review_proof';
    case 'suspicious':    return 'investigate';
    case 'proof_missing': return 'request_proof';
    case 'reupload':      return 'wait_reupload';
    case 'billing_ready': return 'bill';
    default:              return 'review_proof';
  }
}

// ── Handler ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const result = await dbQuery(`
    SELECT
      v.id,
      v.cutter_id,
      v.platform,
      v.url,
      v.title,
      v.claimed_views,
      v.current_views,
      v.views_at_last_invoice,
      v.verification_status,
      v.discrepancy_status,
      v.discrepancy_percent,
      v.is_flagged,
      v.proof_status,
      v.proof_requested_at,
      v.proof_uploaded_at,
      v.created_at,
      c.name                                  AS cutter_name,
      COALESCE(la.last_activity_at, v.created_at) AS last_activity_at
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    LEFT JOIN (
      SELECT entity_id, MAX(created_at) AS last_activity_at
      FROM   audit_log
      WHERE  entity_type = 'video'
      GROUP  BY entity_id
    ) la ON la.entity_id = v.id
    WHERE (
      v.discrepancy_status IN ('critical_difference', 'suspicious_difference')
      OR v.proof_status IN (
        'proof_submitted', 'proof_under_review',
        'proof_requested', 'proof_reupload_requested'
      )
      OR (
        v.verification_status IN ('verified', 'manual_proof')
        AND v.current_views > COALESCE(v.views_at_last_invoice, 0)
      )
      OR v.is_flagged = 1
    )
    ORDER BY v.created_at DESC
    LIMIT 500
  `);

  const items: InboxItem[] = (result.rows as unknown[][]).map(row => {
    const current     = intVal(row[6]) ?? 0;
    const lastInvoice = intVal(row[7]) ?? 0;

    const base = {
      id:                  val(row[0])  ?? '',
      cutter_id:           val(row[1]),
      platform:            val(row[2]),
      url:                 val(row[3]),
      title:               val(row[4]),
      claimed_views:       intVal(row[5]),
      current_views:       current,
      unbilled_views:      Math.max(0, current - lastInvoice),
      verification_status: val(row[8]),
      discrepancy_status:  val(row[9]),
      discrepancy_percent: floatVal(row[10]),
      is_flagged:          intVal(row[11]) ?? 0,
      proof_status:        val(row[12]),
      proof_requested_at:  val(row[13]),
      proof_uploaded_at:   val(row[14]),
      created_at:          val(row[15]),
      cutter_name:         val(row[16]),
      last_activity_at:    val(row[17]),
    };

    const inbox_category   = assignCategory(base);
    const state_age_hours  = hoursElapsed(stateStartAt({
      inbox_category,
      created_at:         base.created_at,
      proof_requested_at: base.proof_requested_at,
      proof_uploaded_at:  base.proof_uploaded_at,
      last_activity_at:   base.last_activity_at,
    }));
    const urgency = classifyUrgency(inbox_category, state_age_hours);
    return {
      ...base,
      inbox_category,
      state_age_hours,
      urgency,
      priority_score:   calcPriority(base) + urgencyBonus(urgency),
      suggested_action: suggestAction(inbox_category, base),
    };
  });

  // Summary counters
  const summary = {
    total:          items.length,
    critical:       items.filter(i => i.inbox_category === 'critical').length,
    proof_waiting:  items.filter(i => i.inbox_category === 'proof_waiting').length,
    proof_overdue:  items.filter(i => i.inbox_category === 'proof_overdue').length,
    billing_ready:  items.filter(i => i.inbox_category === 'billing_ready').length,
    blocked:        items.filter(i => i.inbox_category === 'blocked').length,
    critical_delay: items.filter(i => i.urgency === 'critical_delay').length,
    overdue:        items.filter(i => i.urgency === 'overdue').length,
  };

  // Per-category breakdown for tab badges
  const breakdown = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.inbox_category] = (acc[i.inbox_category] ?? 0) + 1;
    return acc;
  }, {});

  // Unique cutters and platforms present in the inbox (for filter dropdowns)
  const cutters = Array.from(
    new Map(
      items
        .filter(i => i.cutter_id && i.cutter_name)
        .map(i => [i.cutter_id, { id: i.cutter_id!, name: i.cutter_name! }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const platforms = [...new Set(items.map(i => i.platform).filter(Boolean))] as string[];

  return NextResponse.json({ items, summary, breakdown, cutters, platforms });
}
