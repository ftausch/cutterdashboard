/**
 * GET  /api/ops/billing/batches  — list billing batches (filterable)
 * POST /api/ops/billing/batches  — create a new billing batch from eligible clips
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
        a === null                   ? { type: 'null' } :
        typeof a === 'number' && !Number.isInteger(a) ? { type: 'real', value: String(a) } :
        typeof a === 'number'        ? { type: 'integer', value: String(a) } :
        { type: 'text', value: String(a) }
      )}}, { type: 'close' }],
    }),
  });
  const data = await res.json();
  const r    = data.results?.[0];
  if (r?.type === 'error') throw new Error(r.error.message);
  return r?.response?.result ?? { rows: [], cols: [] };
}

async function dbAlter(sql: string) {
  try { await dbQuery(sql); } catch (e) {
    if (!(e instanceof Error) || !e.message.includes('already has a column')) throw e;
  }
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}

async function ensureTables() {
  await dbQuery(`CREATE TABLE IF NOT EXISTS billing_batches (
    id                   TEXT PRIMARY KEY,
    cutter_id            TEXT NOT NULL,
    cutter_name          TEXT,
    period_start         TEXT,
    period_end           TEXT,
    status               TEXT NOT NULL DEFAULT 'draft',
    rate_per_1k          REAL NOT NULL,
    currency             TEXT NOT NULL DEFAULT 'EUR',
    total_clips          INTEGER NOT NULL DEFAULT 0,
    total_billable_views INTEGER NOT NULL DEFAULT 0,
    total_amount         REAL NOT NULL DEFAULT 0,
    notes                TEXT,
    created_by_id        TEXT,
    created_by_name      TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at          TEXT, reviewed_by_id   TEXT, reviewed_by_name TEXT,
    finalized_at         TEXT, finalized_by_id  TEXT, finalized_by_name TEXT,
    exported_at          TEXT, exported_by_id   TEXT,
    cancelled_at         TEXT, cancelled_by_id  TEXT, cancel_reason TEXT
  )`);

  await dbQuery(`CREATE TABLE IF NOT EXISTS billing_batch_items (
    id              TEXT PRIMARY KEY,
    batch_id        TEXT NOT NULL,
    cutter_id       TEXT NOT NULL,
    clip_id         TEXT NOT NULL,
    clip_url        TEXT,
    clip_title      TEXT,
    platform        TEXT,
    billed_baseline INTEGER NOT NULL DEFAULT 0,
    snapshot_views  INTEGER NOT NULL DEFAULT 0,
    billable_views  INTEGER NOT NULL DEFAULT 0,
    rate_per_1k     REAL NOT NULL,
    amount          REAL NOT NULL DEFAULT 0,
    is_included     INTEGER NOT NULL DEFAULT 1,
    excluded_reason TEXT,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    added_by_id     TEXT,
    added_by_name   TEXT
  )`);

  await Promise.all([
    dbAlter(`ALTER TABLE cutter_videos ADD COLUMN billing_status TEXT`),
    dbAlter(`ALTER TABLE cutter_videos ADD COLUMN billing_batch_id TEXT`),
  ]);
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  await ensureTables();

  const sp       = request.nextUrl.searchParams;
  const cutterId = sp.get('cutter_id') ?? '';
  const status   = sp.get('status')    ?? '';

  const conditions: string[] = [];
  const args: unknown[]      = [];
  if (cutterId) { conditions.push('b.cutter_id = ?'); args.push(cutterId); }
  if (status)   { conditions.push('b.status = ?');    args.push(status);   }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const result = await dbQuery(
    `SELECT b.id, b.cutter_id, b.cutter_name,
            b.period_start, b.period_end, b.status,
            b.rate_per_1k, b.currency,
            b.total_clips, b.total_billable_views, b.total_amount,
            b.created_by_name, b.created_at,
            b.finalized_at, b.exported_at, b.cancelled_at
     FROM billing_batches b
     ${where}
     ORDER BY b.created_at DESC
     LIMIT 200`,
    args
  );

  const batches = (result.rows as unknown[][]).map(r => ({
    id:                   val(r[0]),
    cutter_id:            val(r[1]),
    cutter_name:          val(r[2]),
    period_start:         val(r[3]),
    period_end:           val(r[4]),
    status:               val(r[5]) ?? 'draft',
    rate_per_1k:          num(r[6]),
    currency:             val(r[7]) ?? 'EUR',
    total_clips:          num(r[8]) ?? 0,
    total_billable_views: num(r[9]) ?? 0,
    total_amount:         num(r[10]) ?? 0,
    created_by_name:      val(r[11]),
    created_at:           val(r[12]),
    finalized_at:         val(r[13]),
    exported_at:          val(r[14]),
    cancelled_at:         val(r[15]),
  }));

  // Summary counts
  const allResult = await dbQuery(
    `SELECT status, COUNT(*) as cnt, SUM(total_amount) as amount
     FROM billing_batches GROUP BY status`
  );
  const summary: Record<string, { count: number; amount: number }> = {};
  for (const r of allResult.rows as unknown[][]) {
    const s = val(r[0]) ?? 'draft';
    summary[s] = { count: num(r[1]) ?? 0, amount: num(r[2]) ?? 0 };
  }

  return NextResponse.json({ batches, summary });
}

// ── POST ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  await ensureTables();

  const body = await request.json() as {
    cutter_id:    string;
    clip_ids:     string[];
    period_start?: string;
    period_end?:   string;
    notes?:        string;
  };

  if (!body.cutter_id) {
    return NextResponse.json({ error: 'cutter_id ist erforderlich.' }, { status: 400 });
  }
  if (!body.clip_ids?.length) {
    return NextResponse.json({ error: 'Mindestens ein Clip muss ausgewählt sein.' }, { status: 400 });
  }
  if (body.clip_ids.length > 500) {
    return NextResponse.json({ error: 'Maximal 500 Clips pro Batch.' }, { status: 400 });
  }

  // ── 1. Get cutter name ───────────────────────────────────────────────────
  const cutterRes = await dbQuery(
    `SELECT name, rate_per_view FROM cutters WHERE id = ?`, [body.cutter_id]
  );
  if (!cutterRes.rows.length) {
    return NextResponse.json({ error: 'Cutter nicht gefunden.' }, { status: 404 });
  }
  const cutterRow      = cutterRes.rows[0] as unknown[];
  const cutterName     = val(cutterRow[0]) ?? '';
  const legacyRatePerView = num(cutterRow[1]);

  // ── 2. Get most recent billing profile ───────────────────────────────────
  const profileRes = await dbQuery(
    `SELECT rate_per_1k, currency FROM cutter_billing_profiles
     WHERE cutter_id = ?
     ORDER BY effective_from DESC
     LIMIT 1`,
    [body.cutter_id]
  );
  let ratePer1k: number;
  let currency: string;
  if (profileRes.rows.length) {
    const prow = profileRes.rows[0] as unknown[];
    ratePer1k  = num(prow[0]) ?? 0;
    currency   = val(prow[1]) ?? 'EUR';
  } else if (legacyRatePerView !== null && legacyRatePerView > 0) {
    // Fall back to legacy rate_per_view * 1000
    ratePer1k = legacyRatePerView * 1000;
    currency  = 'EUR';
  } else {
    return NextResponse.json({
      error: 'Kein Abrechnungsprofil gefunden. Bitte zuerst einen Tarif anlegen.',
    }, { status: 400 });
  }

  // ── 3. Fetch clip data for all selected clip_ids ─────────────────────────
  // SQLite doesn't support named params for IN, so build placeholders
  const placeholders = body.clip_ids.map(() => '?').join(',');
  const clipRes = await dbQuery(
    `SELECT v.id, v.platform, v.url, v.title,
            CASE
              WHEN v.proof_status IN ('proof_approved')
                OR  v.verification_status IN ('verified', 'manual_proof')
                THEN COALESCE(v.observed_views, v.current_views, v.claimed_views, 0)
              ELSE 0
            END AS verified_views,
            COALESCE(v.views_at_last_invoice, 0) AS billed_baseline
     FROM cutter_videos v
     WHERE v.id IN (${placeholders}) AND v.cutter_id = ?`,
    [...body.clip_ids, body.cutter_id]
  );

  const clipRows = clipRes.rows as unknown[][];
  if (!clipRows.length) {
    return NextResponse.json({ error: 'Keine gültigen Clips gefunden.' }, { status: 400 });
  }

  // ── 4. Calculate totals ──────────────────────────────────────────────────
  let totalBillableViews = 0;
  const itemsToInsert = clipRows.map(r => {
    const verifiedViews  = (num(r[4]) ?? 0);
    const billedBaseline = (num(r[5]) ?? 0);
    const billableViews  = Math.max(0, verifiedViews - billedBaseline);
    const amount         = (billableViews / 1000) * ratePer1k;
    totalBillableViews  += billableViews;
    return {
      id:             randomUUID(),
      clip_id:        val(r[0])!,
      platform:       val(r[1]),
      clip_url:       val(r[2]),
      clip_title:     val(r[3]),
      billed_baseline: billedBaseline,
      snapshot_views:  verifiedViews,
      billable_views:  billableViews,
      amount,
    };
  });

  const totalAmount = (totalBillableViews / 1000) * ratePer1k;
  const batchId     = randomUUID();
  const now         = new Date().toISOString();

  // ── 5. Insert batch ──────────────────────────────────────────────────────
  await dbQuery(
    `INSERT INTO billing_batches
       (id, cutter_id, cutter_name, period_start, period_end,
        status, rate_per_1k, currency,
        total_clips, total_billable_views, total_amount,
        notes, created_by_id, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batchId, body.cutter_id, cutterName,
      body.period_start ?? null, body.period_end ?? null,
      ratePer1k, currency,
      clipRows.length, totalBillableViews, totalAmount,
      body.notes ?? null,
      auth.id, auth.name, now, now,
    ]
  );

  // ── 6. Insert items ──────────────────────────────────────────────────────
  for (const item of itemsToInsert) {
    await dbQuery(
      `INSERT INTO billing_batch_items
         (id, batch_id, cutter_id, clip_id, clip_url, clip_title, platform,
          billed_baseline, snapshot_views, billable_views,
          rate_per_1k, amount, is_included, added_at, added_by_id, added_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        item.id, batchId, body.cutter_id, item.clip_id,
        item.clip_url ?? null, item.clip_title ?? null, item.platform ?? null,
        item.billed_baseline, item.snapshot_views, item.billable_views,
        ratePer1k, item.amount, now, auth.id, auth.name,
      ]
    );
  }

  // ── 7. Mark clips as included in batch ──────────────────────────────────
  for (const item of itemsToInsert) {
    await dbQuery(
      `UPDATE cutter_videos
       SET billing_status = 'included_in_batch', billing_batch_id = ?
       WHERE id = ?`,
      [batchId, item.clip_id]
    );
  }

  // ── 8. Audit log ─────────────────────────────────────────────────────────
  await dbQuery(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, 'billing.batch_created', 'billing_batch', ?, ?, ?)`,
    [
      randomUUID(), auth.id, auth.name, batchId,
      JSON.stringify({ cutter_id: body.cutter_id, clips: clipRows.length, amount: totalAmount }),
      now,
    ]
  ).catch(() => {});

  return NextResponse.json({
    id:                   batchId,
    total_clips:          clipRows.length,
    total_billable_views: totalBillableViews,
    total_amount:         totalAmount,
    rate_per_1k:          ratePer1k,
    currency,
  }, { status: 201 });
}
