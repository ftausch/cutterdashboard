import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';

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

// ── Types ────────────────────────────────────────────────────────────
export type QueueGroup =
  | 'critical'          // critical discrepancy, proof not approved
  | 'proof_overdue'     // proof requested > 48 h ago, still no upload
  | 'reupload_pending'  // cutter hasn't re-uploaded yet
  | 'proof_waiting'     // proof submitted — admin needs to review
  | 'suspicious'        // suspicious discrepancy, no approved proof
  | 'no_proof'          // proof requested < 48 h ago or missing
  | 'billing_ready'     // verified + unbilled views > 0
  | 'review_ready';     // verified, not yet marked reviewed

export type SuggestedAction =
  | 'review_proof'   // proof is waiting — open and approve/reject
  | 'request_proof'  // no proof on a risky clip — ask cutter
  | 'investigate'    // suspicious discrepancy — manual check
  | 'bill'           // ready for invoice
  | 'wait_reupload'  // waiting for cutter
  | 'approve'        // looks clean — just approve
  | 'none';

export interface QueueItem {
  id: string;
  cutter_id: string | null;
  cutter_name: string | null;
  platform: string | null;
  url: string | null;
  title: string | null;
  claimed_views: number | null;
  current_views: number | null;
  unbilled_views: number;
  verification_status: string | null;
  discrepancy_status: string | null;
  discrepancy_percent: number | null;
  is_flagged: number;
  proof_status: string | null;
  proof_requested_at: string | null;
  created_at: string | null;
  queue_group: QueueGroup;
  priority_score: number;
  suggested_action: SuggestedAction;
}

// ── Priority score ───────────────────────────────────────────────────
function priorityScore(r: Omit<QueueItem, 'queue_group' | 'priority_score' | 'suggested_action'>): number {
  let s = 0;

  // Discrepancy severity
  if (r.discrepancy_status === 'critical_difference')   s += 40;
  else if (r.discrepancy_status === 'suspicious_difference') s += 20;

  // Flag
  if (r.is_flagged) s += 35;

  // Proof overdue
  if (r.proof_status === 'proof_requested' && r.proof_requested_at) {
    const h = (Date.now() - new Date(r.proof_requested_at).getTime()) / 3_600_000;
    if (h > 72) s += 40;
    else if (h > 48) s += 30;
    else if (h > 24) s += 15;
  }

  // Proof waiting admin review
  if (r.proof_status === 'proof_submitted' || r.proof_status === 'proof_under_review') s += 20;

  // Reupload requested
  if (r.proof_status === 'proof_reupload_requested') s += 15;

  // Unbilled view scale
  if (r.unbilled_views > 1_000_000)      s += 25;
  else if (r.unbilled_views > 100_000)   s += 10;

  // Age
  if (r.created_at) {
    const d = (Date.now() - new Date(r.created_at).getTime()) / 86_400_000;
    if (d > 30) s += 25;
    else if (d > 14) s += 10;
  }

  return s;
}

// ── Queue group ──────────────────────────────────────────────────────
function queueGroup(r: Omit<QueueItem, 'queue_group' | 'priority_score' | 'suggested_action'>): QueueGroup {
  const approved = r.proof_status === 'proof_approved';

  if (r.discrepancy_status === 'critical_difference' && !approved)
    return 'critical';

  if (r.proof_status === 'proof_requested' && r.proof_requested_at) {
    const h = (Date.now() - new Date(r.proof_requested_at).getTime()) / 3_600_000;
    if (h > 48) return 'proof_overdue';
  }

  if (r.proof_status === 'proof_reupload_requested') return 'reupload_pending';

  if (r.proof_status === 'proof_submitted' || r.proof_status === 'proof_under_review')
    return 'proof_waiting';

  if (r.discrepancy_status === 'suspicious_difference' && !approved)
    return 'suspicious';

  if (r.proof_status === 'proof_requested') return 'no_proof';

  if (
    (r.verification_status === 'verified' || r.verification_status === 'manual_proof') &&
    r.unbilled_views > 0
  ) return 'billing_ready';

  return 'review_ready';
}

// ── Suggested action ─────────────────────────────────────────────────
function suggestedAction(r: Omit<QueueItem, 'queue_group' | 'priority_score' | 'suggested_action'>): SuggestedAction {
  if (r.proof_status === 'proof_submitted' || r.proof_status === 'proof_under_review')
    return 'review_proof';

  if (r.proof_status === 'proof_reupload_requested')
    return 'wait_reupload';

  if (r.discrepancy_status === 'critical_difference' && r.proof_status !== 'proof_approved')
    return 'request_proof';

  if (r.discrepancy_status === 'suspicious_difference')
    return 'investigate';

  if (
    (r.verification_status === 'verified' || r.verification_status === 'manual_proof') &&
    r.unbilled_views > 0
  ) return 'bill';

  if (r.proof_status === 'proof_approved' || r.verification_status === 'verified')
    return 'approve';

  return 'none';
}

// ── Handler ──────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const result = await dbQuery(`
    SELECT
      v.id, v.cutter_id, v.platform, v.url, v.title,
      v.claimed_views, v.current_views, v.views_at_last_invoice,
      v.verification_status, v.discrepancy_status, v.discrepancy_percent,
      v.is_flagged, v.proof_status,
      v.proof_requested_at, v.created_at,
      c.name AS cutter_name
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
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

  const items: QueueItem[] = (result.rows as unknown[][]).map(row => {
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
      created_at:          val(row[14]),
      cutter_name:         val(row[15]),
    };

    return {
      ...base,
      queue_group:      queueGroup(base),
      priority_score:   priorityScore(base),
      suggested_action: suggestedAction(base),
    };
  });

  // Sort: highest priority first
  items.sort((a, b) => b.priority_score - a.priority_score);

  // Group counts
  const groupCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.queue_group] = (acc[item.queue_group] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ items, groupCounts, total: items.length });
}
