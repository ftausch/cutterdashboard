/**
 * POST /api/insights/:id/submit — submit draft for review
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
      requests: [{
        type: 'execute',
        stmt: {
          sql,
          args: args.map(a =>
            a === null            ? { type: 'null' } :
            typeof a === 'number' ? { type: 'integer', value: String(Math.round(a)) } :
            { type: 'text', value: String(a) }
          ),
        },
      }, { type: 'close' }],
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const now    = new Date().toISOString();

  // Verify ownership + status
  const existing = await dbQuery(
    `SELECT status, total_views FROM monthly_insight_reports WHERE id = ? AND cutter_id = ?`,
    [id, auth.id]
  );
  if (!existing.rows.length) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }
  const ex     = existing.rows[0] as unknown[];
  const status = val(ex[0]);
  const views  = num(ex[1]);

  if (!['draft', 'reupload_requested'].includes(status ?? '')) {
    return NextResponse.json({ error: 'Dieser Bericht kann nicht eingereicht werden.' }, { status: 400 });
  }
  if (!views || views <= 0) {
    return NextResponse.json({ error: 'Bitte trage zuerst die Views ein.' }, { status: 400 });
  }

  // Must have at least one proof file
  const proofCount = await dbQuery(
    `SELECT COUNT(*) FROM monthly_insight_proofs WHERE report_id = ?`, [id]
  );
  const cnt = num((proofCount.rows[0] as unknown[])[0]) ?? 0;
  if (cnt === 0) {
    return NextResponse.json({ error: 'Bitte lade mindestens einen Screenshot hoch.' }, { status: 400 });
  }

  await dbQuery(
    `UPDATE monthly_insight_reports
     SET status = 'submitted', submitted_at = COALESCE(submitted_at, ?), updated_at = ?
     WHERE id = ? AND cutter_id = ?`,
    [now, now, id, auth.id]
  );

  return NextResponse.json({ success: true, status: 'submitted' });
}
