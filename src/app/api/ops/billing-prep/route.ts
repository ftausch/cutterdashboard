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

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  // Per-cutter billing summary
  const cuttersResult = await dbQuery(`
    SELECT
      c.id,
      c.name,
      c.email,
      c.rate_per_view,

      -- Total clips
      COUNT(DISTINCT v.id)                                          AS total_clips,

      -- Clips with approved verification
      SUM(CASE
        WHEN v.verification_status IN ('verified', 'manual_proof') THEN 1
        ELSE 0
      END)                                                          AS verified_clips,

      -- Unbilled views (verified clips only)
      SUM(CASE
        WHEN v.verification_status IN ('verified', 'manual_proof')
          THEN MAX(0, COALESCE(v.current_views, 0) - COALESCE(v.views_at_last_invoice, 0))
        ELSE 0
      END)                                                          AS unbilled_views,

      -- Total current views across all clips (for context)
      SUM(COALESCE(v.current_views, 0))                            AS total_current_views,

      -- Clips with pending proof review (blocker)
      SUM(CASE
        WHEN v.proof_status IN ('proof_submitted', 'proof_under_review') THEN 1
        ELSE 0
      END)                                                          AS pending_proof_count,

      -- Clips with overdue proof (cutter hasn't submitted)
      SUM(CASE
        WHEN v.proof_status IN ('proof_requested', 'proof_reupload_requested') THEN 1
        ELSE 0
      END)                                                          AS overdue_proof_count,

      -- Last invoice date
      (SELECT period_end FROM cutter_invoices
       WHERE cutter_id = c.id
       ORDER BY created_at DESC LIMIT 1)                           AS last_invoice_at

    FROM cutters c
    LEFT JOIN cutter_videos v ON v.cutter_id = c.id
    WHERE c.is_active = 1
    GROUP BY c.id
    ORDER BY unbilled_views DESC, c.name
  `);

  const cutters = (cuttersResult.rows as unknown[][]).map(row => {
    const ratePerView   = floatVal(row[3]) ?? 0;
    const unbilledViews = intVal(row[6]) ?? 0;
    const pendingProof  = intVal(row[8]) ?? 0;
    const overdueProof  = intVal(row[9]) ?? 0;

    const estimatedAmount = unbilledViews * ratePerView;

    // Billing is "ready" when:
    // - Has unbilled verified views
    // - No proofs pending admin review (would be approved after review)
    const isReady = unbilledViews > 0 && pendingProof === 0;

    // Blocked = has pending proofs that might add more billable views
    const isBlocked = pendingProof > 0;

    return {
      id:                 val(row[0])  ?? '',
      name:               val(row[1])  ?? '',
      email:              val(row[2])  ?? '',
      rate_per_view:      ratePerView,
      total_clips:        intVal(row[4]) ?? 0,
      verified_clips:     intVal(row[5]) ?? 0,
      unbilled_views:     unbilledViews,
      total_current_views: intVal(row[7]) ?? 0,
      pending_proof_count: pendingProof,
      overdue_proof_count: overdueProof,
      last_invoice_at:    val(row[10]),
      estimated_amount:   estimatedAmount,
      is_ready:           isReady,
      is_blocked:         isBlocked,
    };
  });

  // Grand totals
  const grandTotal = {
    total_cutters:    cutters.length,
    ready_cutters:    cutters.filter(c => c.is_ready).length,
    total_unbilled:   cutters.reduce((s, c) => s + c.unbilled_views, 0),
    total_amount:     cutters.reduce((s, c) => s + c.estimated_amount, 0),
    total_pending_proof: cutters.reduce((s, c) => s + c.pending_proof_count, 0),
  };

  return NextResponse.json({ cutters, grandTotal });
}
