/**
 * PATCH /api/ops/billing/batches/[id]/items/[itemId]
 *   — toggle is_included, set excluded_reason, recalculate batch totals
 *   — only allowed while batch is in draft or reviewed status
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';

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

type Params = { id: string; itemId: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  const { id: batchId, itemId } = await params;

  // Verify batch exists and is in a mutable state
  const batchRes = await dbQuery(
    `SELECT status FROM billing_batches WHERE id = ?`,
    [batchId]
  );
  if (!batchRes.rows.length) {
    return NextResponse.json({ error: 'Batch nicht gefunden.' }, { status: 404 });
  }
  const batchStatus = val((batchRes.rows[0] as unknown[])[0]) ?? '';
  if (!['draft', 'reviewed'].includes(batchStatus)) {
    return NextResponse.json({
      error: `Batch im Status '${batchStatus}' kann nicht mehr bearbeitet werden.`,
    }, { status: 409 });
  }

  const body = await request.json() as {
    is_included:      boolean;
    excluded_reason?: string;
  };

  if (typeof body.is_included !== 'boolean') {
    return NextResponse.json({ error: 'is_included (boolean) ist erforderlich.' }, { status: 400 });
  }

  // Update item inclusion
  await dbQuery(
    `UPDATE billing_batch_items
     SET is_included = ?, excluded_reason = ?
     WHERE id = ? AND batch_id = ?`,
    [body.is_included ? 1 : 0, body.excluded_reason ?? null, itemId, batchId]
  );

  // Recalculate batch totals from all included items
  const now = new Date().toISOString();
  await dbQuery(
    `UPDATE billing_batches
     SET total_clips          = (SELECT COUNT(*)                       FROM billing_batch_items WHERE batch_id = ? AND is_included = 1),
         total_billable_views = (SELECT COALESCE(SUM(billable_views),0) FROM billing_batch_items WHERE batch_id = ? AND is_included = 1),
         total_amount         = (SELECT COALESCE(SUM(amount),0)         FROM billing_batch_items WHERE batch_id = ? AND is_included = 1),
         updated_at           = ?
     WHERE id = ?`,
    [batchId, batchId, batchId, now, batchId]
  );

  // Return refreshed totals so UI can update without a full reload
  const totRes = await dbQuery(
    `SELECT total_clips, total_billable_views, total_amount FROM billing_batches WHERE id = ?`,
    [batchId]
  );
  const tr               = totRes.rows[0] as unknown[];
  const total_clips      = num(tr[0]) ?? 0;
  const total_billable_views = num(tr[1]) ?? 0;
  const total_amount     = num(tr[2]) ?? 0;

  return NextResponse.json({ success: true, total_clips, total_billable_views, total_amount });
}
