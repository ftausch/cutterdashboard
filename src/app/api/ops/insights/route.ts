/**
 * GET /api/ops/insights — admin list of all monthly insight reports
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

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const sp       = request.nextUrl.searchParams;
  const month    = sp.get('month') ?? '';
  const platform = sp.get('platform') ?? '';
  const cutterId = sp.get('cutter') ?? '';
  const status   = sp.get('status') ?? '';

  const conditions: string[] = [];
  const args: unknown[]      = [];

  if (month)    { conditions.push('r.month = ?');     args.push(month); }
  if (platform) { conditions.push('r.platform = ?');  args.push(platform); }
  if (cutterId) { conditions.push('r.cutter_id = ?'); args.push(cutterId); }
  if (status)   { conditions.push('r.status = ?');    args.push(status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [reportsRes, cuttersRes, summaryRes, proofCountsRes] = await Promise.all([
    dbQuery(
      `SELECT r.id, r.cutter_id, c.name AS cutter_name,
              r.platform, r.month, r.status,
              r.total_views, r.submitted_at, r.reviewed_at, r.created_at,
              r.admin_review_note
       FROM monthly_insight_reports r
       JOIN cutters c ON c.id = r.cutter_id
       ${where}
       ORDER BY
         CASE r.status
           WHEN 'submitted'  THEN 0
           WHEN 'reupload_requested' THEN 1
           WHEN 'under_review' THEN 2
           WHEN 'draft'      THEN 3
           WHEN 'rejected'   THEN 4
           WHEN 'approved'   THEN 5
           ELSE 6
         END,
         r.submitted_at ASC NULLS LAST
       LIMIT 500`,
      args
    ),
    dbQuery(`SELECT id, name FROM cutters ORDER BY name`),
    dbQuery(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'submitted'  THEN 1 ELSE 0 END) AS submitted,
         SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS under_review,
         SUM(CASE WHEN status = 'approved'   THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN status = 'rejected'   THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN status = 'draft'      THEN 1 ELSE 0 END) AS draft,
         SUM(CASE WHEN status = 'reupload_requested' THEN 1 ELSE 0 END) AS reupload_requested
       FROM monthly_insight_reports${where ? ' ' + where : ''}`
      , args
    ),
    dbQuery(
      `SELECT report_id, COUNT(*) as cnt FROM monthly_insight_proofs GROUP BY report_id`
    ),
  ]);

  const proofMap = new Map<string, number>();
  for (const row of proofCountsRes.rows as unknown[][]) {
    const rid = val(row[0]); const cnt = num(row[1]) ?? 0;
    if (rid) proofMap.set(rid, cnt);
  }

  const items = (reportsRes.rows as unknown[][]).map(r => ({
    id:                val(r[0]),
    cutter_id:         val(r[1]),
    cutter_name:       val(r[2]),
    platform:          val(r[3]),
    month:             val(r[4]),
    status:            val(r[5]) ?? 'draft',
    total_views:       num(r[6]),
    submitted_at:      val(r[7]),
    reviewed_at:       val(r[8]),
    created_at:        val(r[9]),
    admin_review_note: val(r[10]),
    proof_count:       proofMap.get(val(r[0]) ?? '') ?? 0,
  }));

  const cutters = (cuttersRes.rows as unknown[][]).map(r => ({ id: val(r[0]), name: val(r[1]) }));

  const sr = (summaryRes.rows[0] as unknown[]) ?? [];
  const summary = {
    total:              num(sr[0]) ?? 0,
    submitted:          num(sr[1]) ?? 0,
    under_review:       num(sr[2]) ?? 0,
    approved:           num(sr[3]) ?? 0,
    rejected:           num(sr[4]) ?? 0,
    draft:              num(sr[5]) ?? 0,
    reupload_requested: num(sr[6]) ?? 0,
  };

  return NextResponse.json({ items, summary, cutters });
}
