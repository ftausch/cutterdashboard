/**
 * GET  /api/insights  — list own monthly insight reports
 * POST /api/insights  — create a new draft report
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { randomUUID } from 'crypto';

// ── DB helper ─────────────────────────────────────────────────────────────
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

// ── DDL ───────────────────────────────────────────────────────────────────
const REPORTS_DDL = `CREATE TABLE IF NOT EXISTS monthly_insight_reports (
  id                 TEXT PRIMARY KEY,
  cutter_id          TEXT NOT NULL,
  platform           TEXT NOT NULL,
  month              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft',

  total_views        INTEGER,
  total_clips        INTEGER,
  total_likes        INTEGER,
  total_comments     INTEGER,
  total_shares       INTEGER,
  avg_watch_time_sec INTEGER,
  followers_start    INTEGER,
  followers_end      INTEGER,

  top_countries      TEXT NOT NULL DEFAULT '[]',
  top_cities         TEXT NOT NULL DEFAULT '[]',

  cutter_note        TEXT,
  admin_review_note  TEXT,

  reviewed_by_id     TEXT,
  reviewed_by_name   TEXT,
  reviewed_at        TEXT,
  submitted_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(cutter_id, platform, month)
)`;

const PROOFS_DDL = `CREATE TABLE IF NOT EXISTS monthly_insight_proofs (
  id          TEXT PRIMARY KEY,
  report_id   TEXT NOT NULL,
  cutter_id   TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name   TEXT,
  file_size   INTEGER,
  mime_type   TEXT,
  description TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

async function ensureTables() {
  await dbQuery(REPORTS_DDL);
  await dbQuery(PROOFS_DDL);
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  await ensureTables();

  const sp    = request.nextUrl.searchParams;
  const month = sp.get('month') ?? '';

  const conditions: string[] = ['r.cutter_id = ?'];
  const args: unknown[]      = [auth.id];

  if (month) { conditions.push('r.month = ?'); args.push(month); }

  const where = conditions.join(' AND ');

  const [reportsRes, proofsCountRes] = await Promise.all([
    dbQuery(
      `SELECT r.id, r.platform, r.month, r.status,
              r.total_views, r.total_clips, r.submitted_at,
              r.reviewed_at, r.admin_review_note, r.created_at, r.updated_at
       FROM monthly_insight_reports r
       WHERE ${where}
       ORDER BY r.month DESC, r.platform ASC`,
      args
    ),
    dbQuery(
      `SELECT report_id, COUNT(*) as cnt
       FROM monthly_insight_proofs
       WHERE cutter_id = ?
       GROUP BY report_id`,
      [auth.id]
    ),
  ]);

  const proofCounts = new Map<string, number>();
  for (const row of proofsCountRes.rows as unknown[][]) {
    const rid = val(row[0]);
    const cnt = num(row[1]) ?? 0;
    if (rid) proofCounts.set(rid, cnt);
  }

  const reports = (reportsRes.rows as unknown[][]).map(r => ({
    id:                val(r[0]),
    platform:          val(r[1]),
    month:             val(r[2]),
    status:            val(r[3]) ?? 'draft',
    total_views:       num(r[4]),
    total_clips:       num(r[5]),
    submitted_at:      val(r[6]),
    reviewed_at:       val(r[7]),
    admin_review_note: val(r[8]),
    created_at:        val(r[9]),
    updated_at:        val(r[10]),
    proof_count:       proofCounts.get(val(r[0]) ?? '') ?? 0,
  }));

  return NextResponse.json({ reports });
}

// ── POST ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  await ensureTables();

  const body = await request.json() as {
    platform: string;
    month:    string;
  };

  if (!body.platform || !body.month) {
    return NextResponse.json({ error: 'platform und month sind Pflichtfelder.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'month muss im Format YYYY-MM sein.' }, { status: 400 });
  }

  // Check for existing report (idempotent create — return existing if draft)
  const existing = await dbQuery(
    `SELECT id, status FROM monthly_insight_reports WHERE cutter_id = ? AND platform = ? AND month = ?`,
    [auth.id, body.platform, body.month]
  );
  if (existing.rows.length) {
    const ex = existing.rows[0] as unknown[];
    return NextResponse.json({
      id:       val(ex[0]),
      status:   val(ex[1]),
      existing: true,
    });
  }

  const id  = randomUUID();
  const now = new Date().toISOString();

  await dbQuery(
    `INSERT INTO monthly_insight_reports
       (id, cutter_id, platform, month, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
    [id, auth.id, body.platform, body.month, now, now]
  );

  return NextResponse.json({ id, status: 'draft', existing: false }, { status: 201 });
}
