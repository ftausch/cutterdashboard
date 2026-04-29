/**
 * GET    /api/insights/:id  — report detail (own only)
 * PATCH  /api/insights/:id  — update draft fields (blocked when locked)
 * DELETE /api/insights/:id  — delete draft (blocked when locked)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { getSignedUrl } from '@/lib/storage';

// ── DB helpers ────────────────────────────────────────────────────────────
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

/** Run ALTER TABLE safely — silently ignores "already has a column" / "duplicate column" errors. */
async function dbAlter(sql: string) {
  try { await dbQuery(sql); } catch (e) {
    if (!(e instanceof Error) || (!e.message.includes('already has a column') && !e.message.includes('duplicate column'))) throw e;
  }
}

async function runLockMigration() {
  await Promise.all([
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN is_editable INTEGER NOT NULL DEFAULT 1`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN locked_at TEXT`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN locked_by_id TEXT`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN locked_by_name TEXT`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN lock_reason TEXT`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN unlocked_at TEXT`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN unlocked_by_id TEXT`),
    dbAlter(`ALTER TABLE monthly_insight_reports ADD COLUMN unlocked_by_name TEXT`),
  ]);
}

function val(c: unknown): string | null {
  if (c == null) return null;
  return (c as { value: string | null }).value ?? null;
}
function num(c: unknown): number | null {
  const v = val(c); if (!v) return null;
  const n = parseFloat(v); return isNaN(n) ? null : n;
}
function bool(c: unknown): boolean {
  return num(c) !== 0;
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  await runLockMigration();

  const { id } = await params;

  const [reportRes, proofsRes] = await Promise.all([
    dbQuery(
      `SELECT id, cutter_id, platform, month, status,
              total_views, total_clips, total_likes, total_comments, total_shares,
              avg_watch_time_sec, followers_start, followers_end,
              top_countries, top_cities, cutter_note,
              admin_review_note, reviewed_by_name, reviewed_at,
              submitted_at, created_at, updated_at,
              is_editable, locked_at, locked_by_name, lock_reason
       FROM monthly_insight_reports
       WHERE id = ? AND cutter_id = ?`,
      [id, auth.id]
    ),
    dbQuery(
      `SELECT id, storage_path, file_name, file_size, mime_type, description, uploaded_at
       FROM monthly_insight_proofs
       WHERE report_id = ? AND cutter_id = ?
       ORDER BY uploaded_at DESC`,
      [id, auth.id]
    ),
  ]);

  if (!reportRes.rows.length) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }

  const r = reportRes.rows[0] as unknown[];
  const report = {
    id:                val(r[0]),
    cutter_id:         val(r[1]),
    platform:          val(r[2]),
    month:             val(r[3]),
    status:            val(r[4]) ?? 'draft',
    total_views:       num(r[5]),
    total_clips:       num(r[6]),
    total_likes:       num(r[7]),
    total_comments:    num(r[8]),
    total_shares:      num(r[9]),
    avg_watch_time_sec: num(r[10]),
    followers_start:   num(r[11]),
    followers_end:     num(r[12]),
    top_countries:     JSON.parse(val(r[13]) ?? '[]'),
    top_cities:        JSON.parse(val(r[14]) ?? '[]'),
    cutter_note:       val(r[15]),
    admin_review_note: val(r[16]),
    reviewed_by_name:  val(r[17]),
    reviewed_at:       val(r[18]),
    submitted_at:      val(r[19]),
    created_at:        val(r[20]),
    updated_at:        val(r[21]),
    // lock fields
    is_editable:       bool(r[22]),
    locked_at:         val(r[23]),
    locked_by_name:    val(r[24]),
    lock_reason:       val(r[25]),
  };

  const proofs = await Promise.all(
    (proofsRes.rows as unknown[][]).map(async f => {
      const path = val(f[1]);
      let signed_url: string | null = null;
      if (path) {
        try { signed_url = await getSignedUrl(path); } catch { signed_url = null; }
      }
      return {
        id:          val(f[0]),
        signed_url,
        file_name:   val(f[2]),
        file_size:   num(f[3]),
        mime_type:   val(f[4]),
        description: val(f[5]),
        uploaded_at: val(f[6]),
      };
    })
  );

  return NextResponse.json({ report, proofs });
}

// ── PATCH ─────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const body   = await request.json() as Record<string, unknown>;
  const now    = new Date().toISOString();

  const existing = await dbQuery(
    `SELECT status, is_editable FROM monthly_insight_reports WHERE id = ? AND cutter_id = ?`,
    [id, auth.id]
  );
  if (!existing.rows.length) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }
  const ex         = existing.rows[0] as unknown[];
  const status     = val(ex[0]);
  const isEditable = bool(ex[1]);

  if (!isEditable) {
    return NextResponse.json({
      error: 'Dieser Bericht wurde vom Admin gesperrt und kann nicht bearbeitet werden.',
      locked: true,
    }, { status: 403 });
  }
  if (status === 'approved') {
    return NextResponse.json({ error: 'Genehmigte Berichte können nicht bearbeitet werden.' }, { status: 400 });
  }

  await dbQuery(
    `UPDATE monthly_insight_reports
     SET total_views        = COALESCE(?, total_views),
         total_clips        = COALESCE(?, total_clips),
         total_likes        = COALESCE(?, total_likes),
         total_comments     = COALESCE(?, total_comments),
         total_shares       = COALESCE(?, total_shares),
         avg_watch_time_sec = COALESCE(?, avg_watch_time_sec),
         followers_start    = COALESCE(?, followers_start),
         followers_end      = COALESCE(?, followers_end),
         top_countries      = COALESCE(?, top_countries),
         top_cities         = COALESCE(?, top_cities),
         cutter_note        = COALESCE(?, cutter_note),
         updated_at         = ?
     WHERE id = ? AND cutter_id = ?`,
    [
      typeof body.total_views === 'number' ? body.total_views : null,
      typeof body.total_clips === 'number' ? body.total_clips : null,
      typeof body.total_likes === 'number' ? body.total_likes : null,
      typeof body.total_comments === 'number' ? body.total_comments : null,
      typeof body.total_shares === 'number' ? body.total_shares : null,
      typeof body.avg_watch_time_sec === 'number' ? body.avg_watch_time_sec : null,
      typeof body.followers_start === 'number' ? body.followers_start : null,
      typeof body.followers_end === 'number' ? body.followers_end : null,
      Array.isArray(body.top_countries) ? JSON.stringify(body.top_countries) : null,
      Array.isArray(body.top_cities) ? JSON.stringify(body.top_cities) : null,
      typeof body.cutter_note === 'string' ? body.cutter_note : null,
      now, id, auth.id,
    ]
  );

  return NextResponse.json({ success: true });
}

// ── DELETE ────────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'PROOF_UPLOAD');
  if (!isCutter(auth)) return auth;

  const { id } = await params;

  const existing = await dbQuery(
    `SELECT status, is_editable FROM monthly_insight_reports WHERE id = ? AND cutter_id = ?`,
    [id, auth.id]
  );
  if (!existing.rows.length) {
    return NextResponse.json({ error: 'Bericht nicht gefunden.' }, { status: 404 });
  }
  const ex         = existing.rows[0] as unknown[];
  const status     = val(ex[0]);
  const isEditable = bool(ex[1]);

  if (!isEditable) {
    return NextResponse.json({
      error: 'Dieser Bericht wurde vom Admin gesperrt und kann nicht gelöscht werden.',
      locked: true,
    }, { status: 403 });
  }
  if (!['draft', 'reupload_requested'].includes(status ?? '')) {
    return NextResponse.json({ error: 'Nur Entwürfe können gelöscht werden.' }, { status: 400 });
  }

  await dbQuery(`DELETE FROM monthly_insight_proofs WHERE report_id = ?`, [id]);
  await dbQuery(`DELETE FROM monthly_insight_reports WHERE id = ? AND cutter_id = ?`, [id, auth.id]);

  return NextResponse.json({ success: true });
}
