/**
 * GET  /api/ops/audits  — list monthly audits (filterable)
 * POST /api/ops/audits  — create a new monthly audit entry
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { scoreAuditRisk, type DataSource } from '@/lib/audit-risk';
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
            a === null     ? { type: 'null' } :
            typeof a === 'number' ? { type: 'integer', value: String(Math.round(a)) } :
            { type: 'text', value: String(a) }
          ),
        },
      }, { type: 'close' }],
    }),
  });
  const data   = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result ?? { rows: [], cols: [] };
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (v === null) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

// ── DDL (idempotent) ──────────────────────────────────────────────────────
const DDL = `CREATE TABLE IF NOT EXISTS monthly_audits (
  id                 TEXT PRIMARY KEY,
  cutter_id          TEXT NOT NULL,
  platform           TEXT NOT NULL,
  month              TEXT NOT NULL,

  total_views        INTEGER DEFAULT 0,
  total_clips        INTEGER DEFAULT 0,
  total_likes        INTEGER,
  total_comments     INTEGER,
  total_shares       INTEGER,
  avg_watch_time_sec INTEGER,

  followers_start    INTEGER,
  followers_end      INTEGER,

  top_countries      TEXT NOT NULL DEFAULT '[]',
  top_cities         TEXT NOT NULL DEFAULT '[]',

  data_source        TEXT NOT NULL DEFAULT 'unavailable',
  cutter_notes       TEXT,

  fraud_risk_score   INTEGER NOT NULL DEFAULT 0,
  geo_risk           INTEGER NOT NULL DEFAULT 0,
  engagement_risk    INTEGER NOT NULL DEFAULT 0,
  spike_risk         INTEGER NOT NULL DEFAULT 0,
  data_quality_risk  INTEGER NOT NULL DEFAULT 0,
  risk_flags         TEXT NOT NULL DEFAULT '[]',

  audit_status       TEXT NOT NULL DEFAULT 'pending',

  reviewed_by_id     TEXT,
  reviewed_by_name   TEXT,
  reviewed_at        TEXT,
  review_notes       TEXT,

  submitted_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(cutter_id, platform, month)
)`;

const FILES_DDL = `CREATE TABLE IF NOT EXISTS monthly_audit_files (
  id          TEXT PRIMARY KEY,
  audit_id    TEXT NOT NULL,
  cutter_id   TEXT NOT NULL,
  file_url    TEXT NOT NULL,
  file_name   TEXT,
  file_size   INTEGER,
  mime_type   TEXT,
  description TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

async function ensureTables() {
  await dbQuery(DDL);
  await dbQuery(FILES_DDL);
}

// ── GET — list ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  await ensureTables();

  const sp       = request.nextUrl.searchParams;
  const month    = sp.get('month')    ?? new Date().toISOString().slice(0, 7);
  const platform = sp.get('platform') ?? '';
  const cutterId = sp.get('cutter')   ?? '';
  const status   = sp.get('status')   ?? '';
  const risk     = sp.get('risk')     ?? '';   // low|medium|high|critical

  const conditions: string[] = ['a.month = ?'];
  const args: unknown[]      = [month];

  if (platform) { conditions.push('a.platform = ?'); args.push(platform); }
  if (cutterId) { conditions.push('a.cutter_id = ?'); args.push(cutterId); }
  if (status)   { conditions.push('a.audit_status = ?'); args.push(status); }
  if (risk) {
    const ranges: Record<string, string> = {
      low:      'a.fraud_risk_score < 26',
      medium:   'a.fraud_risk_score >= 26 AND a.fraud_risk_score < 51',
      high:     'a.fraud_risk_score >= 51 AND a.fraud_risk_score < 76',
      critical: 'a.fraud_risk_score >= 76',
    };
    if (ranges[risk]) conditions.push(ranges[risk]);
  }

  const where = conditions.join(' AND ');

  const [auditResult, cutterResult, summaryResult] = await Promise.all([
    dbQuery(
      `SELECT a.id, a.cutter_id, a.platform, a.month,
              a.total_views, a.total_clips,
              a.data_source, a.audit_status,
              a.fraud_risk_score, a.risk_flags,
              a.submitted_at, a.reviewed_at,
              c.name AS cutter_name
       FROM monthly_audits a
       JOIN cutters c ON c.id = a.cutter_id
       WHERE ${where}
       ORDER BY a.fraud_risk_score DESC, a.created_at DESC
       LIMIT 200`,
      args
    ),
    dbQuery(`SELECT id, name FROM cutters ORDER BY name`),
    dbQuery(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN audit_status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN audit_status = 'flagged' THEN 1 ELSE 0 END) AS flagged,
         SUM(CASE WHEN audit_status = 'approved' THEN 1 ELSE 0 END) AS approved,
         SUM(CASE WHEN fraud_risk_score >= 51 THEN 1 ELSE 0 END) AS high_risk,
         SUM(CASE WHEN fraud_risk_score >= 76 THEN 1 ELSE 0 END) AS critical
       FROM monthly_audits
       WHERE month = ?`,
      [month]
    ),
  ]);

  const items = (auditResult.rows as unknown[][]).map(r => ({
    id:               val(r[0]),
    cutter_id:        val(r[1]),
    platform:         val(r[2]),
    month:            val(r[3]),
    total_views:      num(r[4]) ?? 0,
    total_clips:      num(r[5]) ?? 0,
    data_source:      val(r[6]) ?? 'unavailable',
    audit_status:     val(r[7]) ?? 'pending',
    fraud_risk_score: num(r[8]) ?? 0,
    risk_flags:       JSON.parse(val(r[9]) ?? '[]') as string[],
    submitted_at:     val(r[10]),
    reviewed_at:      val(r[11]),
    cutter_name:      val(r[12]),
  }));

  const cutters = (cutterResult.rows as unknown[][]).map(r => ({
    id: val(r[0]), name: val(r[1]),
  }));

  const sr = (summaryResult.rows[0] as unknown[]) ?? [];
  const summary = {
    total:     num(sr[0]) ?? 0,
    pending:   num(sr[1]) ?? 0,
    flagged:   num(sr[2]) ?? 0,
    approved:  num(sr[3]) ?? 0,
    high_risk: num(sr[4]) ?? 0,
    critical:  num(sr[5]) ?? 0,
  };

  return NextResponse.json({ items, summary, cutters, month });
}

// ── POST — create ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  await ensureTables();

  const body = await request.json() as {
    cutter_id:         string;
    platform:          string;
    month:             string;       // YYYY-MM
    total_views?:      number;
    total_clips?:      number;
    total_likes?:      number | null;
    total_comments?:   number | null;
    total_shares?:     number | null;
    avg_watch_time_sec?: number | null;
    followers_start?:  number | null;
    followers_end?:    number | null;
    top_countries?:    unknown[];
    top_cities?:       unknown[];
    data_source?:      DataSource;
    cutter_notes?:     string;
  };

  if (!body.cutter_id || !body.platform || !body.month) {
    return NextResponse.json({ error: 'cutter_id, platform und month sind Pflichtfelder.' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: 'month muss im Format YYYY-MM sein.' }, { status: 400 });
  }

  // Fetch previous month views for spike detection
  const prevMonth = (() => {
    const [y, m] = body.month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const prevResult = await dbQuery(
    `SELECT total_views FROM monthly_audits WHERE cutter_id = ? AND platform = ? AND month = ?`,
    [body.cutter_id, body.platform, prevMonth]
  );
  const prevViews = prevResult.rows.length
    ? (num((prevResult.rows[0] as unknown[])[0]) ?? null)
    : null;

  const countries = (body.top_countries ?? []) as { code: string; name: string; pct: number }[];

  const risk = scoreAuditRisk({
    platform:         body.platform,
    total_views:      body.total_views ?? 0,
    total_clips:      body.total_clips ?? 0,
    total_likes:      body.total_likes ?? null,
    total_comments:   body.total_comments ?? null,
    total_shares:     body.total_shares ?? null,
    top_countries:    countries,
    data_source:      body.data_source ?? 'unavailable',
    has_proof_files:  false,
    prev_month_views: prevViews,
  });

  const id  = randomUUID();
  const now = new Date().toISOString();

  await dbQuery(
    `INSERT INTO monthly_audits
       (id, cutter_id, platform, month,
        total_views, total_clips, total_likes, total_comments, total_shares,
        avg_watch_time_sec, followers_start, followers_end,
        top_countries, top_cities, data_source, cutter_notes,
        fraud_risk_score, geo_risk, engagement_risk, spike_risk, data_quality_risk, risk_flags,
        audit_status, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?,
             ?, ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?,
             'pending', ?, ?, ?)`,
    [
      id, body.cutter_id, body.platform, body.month,
      body.total_views ?? 0, body.total_clips ?? 0,
      body.total_likes ?? null, body.total_comments ?? null, body.total_shares ?? null,
      body.avg_watch_time_sec ?? null, body.followers_start ?? null, body.followers_end ?? null,
      JSON.stringify(body.top_countries ?? []),
      JSON.stringify(body.top_cities    ?? []),
      body.data_source ?? 'unavailable', body.cutter_notes ?? null,
      risk.score, risk.geo, risk.engagement, risk.spike, risk.data_quality,
      JSON.stringify(risk.flags),
      body.total_views ? now : null, now, now,
    ]
  );

  return NextResponse.json({ id, fraud_risk_score: risk.score, flags: risk.flags });
}
