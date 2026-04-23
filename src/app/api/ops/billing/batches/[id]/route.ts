/**
 * GET   /api/ops/billing/batches/[id]  — batch detail + items
 * PATCH /api/ops/billing/batches/[id]  — advance batch status (review | finalize | export | cancel)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { randomUUID } from 'crypto';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args: args.map(a =>
        a === null                                      ? { type: 'null' } :
        typeof a === 'number' && !Number.isInteger(a)  ? { type: 'real',    value: String(a) } :
        typeof a === 'number'                          ? { type: 'integer', value: String(a) } :
        { type: 'text', value: String(a) }
      )}}, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

type Params = { id: string };

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id } = await params;

  // Fetch batch header
  const batchRes = await dbQuery(
    `SELECT id, cutter_id, cutter_name,
            period_start, period_end, status,
            rate_per_1k, currency,
            total_clips, total_billable_views, total_amount,
            notes, created_by_id, created_by_name, created_at, updated_at,
            reviewed_at, reviewed_by_id, reviewed_by_name,
            finalized_at, finalized_by_id, finalized_by_name,
            exported_at, exported_by_id,
            cancelled_at, cancelled_by_id, cancel_reason
     FROM billing_batches WHERE id = ?`,
    [id]
  );

  if (!batchRes.rows.length) {
    return NextResponse.json({ error: 'Batch nicht gefunden.' }, { status: 404 });
  }

  const r = batchRes.rows[0] as unknown[];
  const batch = {
    id:                   val(r[0]),
    cutter_id:            val(r[1]),
    cutter_name:          val(r[2]),
    period_start:         val(r[3]),
    period_end:           val(r[4]),
    status:               val(r[5]) ?? 'draft',
    rate_per_1k:          num(r[6]),
    currency:             val(r[7]) ?? 'EUR',
    total_clips:          num(r[8])  ?? 0,
    total_billable_views: num(r[9])  ?? 0,
    total_amount:         num(r[10]) ?? 0,
    notes:                val(r[11]),
    created_by_id:        val(r[12]),
    created_by_name:      val(r[13]),
    created_at:           val(r[14]),
    updated_at:           val(r[15]),
    reviewed_at:          val(r[16]),
    reviewed_by_id:       val(r[17]),
    reviewed_by_name:     val(r[18]),
    finalized_at:         val(r[19]),
    finalized_by_id:      val(r[20]),
    finalized_by_name:    val(r[21]),
    exported_at:          val(r[22]),
    exported_by_id:       val(r[23]),
    cancelled_at:         val(r[24]),
    cancelled_by_id:      val(r[25]),
    cancel_reason:        val(r[26]),
  };

  // Fetch items with live view count from cutter_videos
  const itemsRes = await dbQuery(
    `SELECT i.id, i.clip_id, i.clip_url, i.clip_title, i.platform,
            i.billed_baseline, i.snapshot_views, i.billable_views,
            i.rate_per_1k, i.amount, i.is_included, i.excluded_reason,
            v.current_views, v.verification_status, v.proof_status
     FROM billing_batch_items i
     LEFT JOIN cutter_videos v ON v.id = i.clip_id
     WHERE i.batch_id = ?
     ORDER BY i.platform ASC, i.clip_title ASC`,
    [id]
  );

  const items = (itemsRes.rows as unknown[][]).map(ir => ({
    id:                  val(ir[0]),
    clip_id:             val(ir[1]),
    clip_url:            val(ir[2]),
    clip_title:          val(ir[3]),
    platform:            val(ir[4]),
    billed_baseline:     num(ir[5])  ?? 0,
    snapshot_views:      num(ir[6])  ?? 0,
    billable_views:      num(ir[7])  ?? 0,
    rate_per_1k:         num(ir[8]),
    amount:              num(ir[9])  ?? 0,
    is_included:         num(ir[10]) === 1,
    excluded_reason:     val(ir[11]),
    current_views:       num(ir[12]),
    verification_status: val(ir[13]),
    proof_status:        val(ir[14]),
  }));

  return NextResponse.json({ batch, items });
}

// ── PATCH ─────────────────────────────────────────────────────────────────
// Allowed actions: review | finalize | export | cancel
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const body = await request.json() as {
    action:        string;
    cancel_reason?: string;
    note?:         string;
  };

  const VALID_ACTIONS = ['review', 'finalize', 'export', 'cancel'];
  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: `Ungültige Aktion. Erlaubt: ${VALID_ACTIONS.join(', ')}.` }, { status: 400 });
  }

  // Fetch current status
  const cur = await dbQuery(`SELECT status, cutter_id FROM billing_batches WHERE id = ?`, [id]);
  if (!cur.rows.length) {
    return NextResponse.json({ error: 'Batch nicht gefunden.' }, { status: 404 });
  }
  const curRow      = cur.rows[0] as unknown[];
  const curStatus   = val(curRow[0]) ?? 'draft';
  const cutterId    = val(curRow[1]);

  // Validate transitions
  const TRANSITIONS: Record<string, string[]> = {
    review:   ['draft'],
    finalize: ['reviewed'],
    export:   ['finalized'],
    cancel:   ['draft', 'reviewed', 'finalized'],
  };
  if (!TRANSITIONS[body.action].includes(curStatus)) {
    return NextResponse.json({
      error: `Aktion '${body.action}' ist im Status '${curStatus}' nicht erlaubt.`,
    }, { status: 409 });
  }

  const now = new Date().toISOString();

  // ── review ───────────────────────────────────────────────────────────────
  if (body.action === 'review') {
    await dbQuery(
      `UPDATE billing_batches
       SET status = 'reviewed', reviewed_at = ?, reviewed_by_id = ?, reviewed_by_name = ?, updated_at = ?
       WHERE id = ?`,
      [now, auth.id, auth.name, now, id]
    );

  // ── finalize ─────────────────────────────────────────────────────────────
  } else if (body.action === 'finalize') {
    // Recalculate totals from included items only
    const totRes = await dbQuery(
      `SELECT COUNT(*) AS tc,
              COALESCE(SUM(billable_views), 0) AS tbv,
              COALESCE(SUM(amount), 0) AS ta
       FROM billing_batch_items
       WHERE batch_id = ? AND is_included = 1`,
      [id]
    );
    const tRow            = totRes.rows[0] as unknown[];
    const totalClips      = num(tRow[0]) ?? 0;
    const totalBillViews  = num(tRow[1]) ?? 0;
    const totalAmount     = num(tRow[2]) ?? 0;

    await dbQuery(
      `UPDATE billing_batches
       SET status = 'finalized',
           finalized_at = ?, finalized_by_id = ?, finalized_by_name = ?,
           total_clips = ?, total_billable_views = ?, total_amount = ?,
           updated_at = ?
       WHERE id = ?`,
      [now, auth.id, auth.name, totalClips, totalBillViews, totalAmount, now, id]
    );

    // Advance included clips: views_at_last_invoice = snapshot_views, billing_status = invoiced
    const inclRes = await dbQuery(
      `SELECT clip_id, snapshot_views FROM billing_batch_items WHERE batch_id = ? AND is_included = 1`,
      [id]
    );
    for (const ir of inclRes.rows as unknown[][]) {
      const clipId        = val(ir[0]);
      const snapshotViews = num(ir[1]) ?? 0;
      if (clipId) {
        await dbQuery(
          `UPDATE cutter_videos
           SET views_at_last_invoice = ?, billing_status = 'invoiced', billing_batch_id = NULL
           WHERE id = ?`,
          [snapshotViews, clipId]
        );
      }
    }

    // Clear billing_status for excluded items so they're eligible again next time
    await dbQuery(
      `UPDATE cutter_videos
       SET billing_status = NULL, billing_batch_id = NULL
       WHERE billing_batch_id = ? AND billing_status = 'included_in_batch'`,
      [id]
    );

  // ── export ────────────────────────────────────────────────────────────────
  } else if (body.action === 'export') {
    await dbQuery(
      `UPDATE billing_batches
       SET status = 'exported', exported_at = ?, exported_by_id = ?, updated_at = ?
       WHERE id = ?`,
      [now, auth.id, now, id]
    );

  // ── cancel ────────────────────────────────────────────────────────────────
  } else if (body.action === 'cancel') {
    await dbQuery(
      `UPDATE billing_batches
       SET status = 'cancelled', cancelled_at = ?, cancelled_by_id = ?, cancel_reason = ?, updated_at = ?
       WHERE id = ?`,
      [now, auth.id, body.cancel_reason ?? null, now, id]
    );

    // Reset all clips included in this batch so they become eligible again
    await dbQuery(
      `UPDATE cutter_videos
       SET billing_status = NULL, billing_batch_id = NULL
       WHERE billing_batch_id = ?`,
      [id]
    );
  }

  // Audit log (silent fail — table may not exist yet)
  await dbQuery(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, 'billing_batch', ?, ?, ?)`,
    [
      randomUUID(), auth.id, auth.name,
      `billing.batch_${body.action}`,
      id,
      JSON.stringify({ cutter_id: cutterId, cancel_reason: body.cancel_reason ?? null, note: body.note ?? null }),
      now,
    ]
  ).catch(() => {});

  return NextResponse.json({ success: true, status: body.action === 'review' ? 'reviewed' : body.action === 'finalize' ? 'finalized' : body.action === 'export' ? 'exported' : 'cancelled' });
}
