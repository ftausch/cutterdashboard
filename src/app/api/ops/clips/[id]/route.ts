import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { resolveProofUrl } from '@/lib/storage';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
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
  const data = await res.json();
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id } = await params;

  const videoResult = await dbQuery(
    `SELECT
      v.id, v.cutter_id, v.platform, v.external_id, v.url, v.title,
      v.account_handle, v.current_views, v.views_at_last_invoice, v.claimed_views,
      v.observed_views, v.api_views,
      v.verification_status, v.verification_source, v.confidence_level,
      v.discrepancy_status, v.discrepancy_percent,
      v.is_flagged, v.flag_reason,
      v.proof_url, v.proof_status, v.proof_cutter_note, v.proof_rejection_reason,
      v.proof_reviewer_id, v.proof_reviewer_name, v.proof_reviewed_at,
      v.proof_uploaded_at, v.proof_requested_at, v.proof_requested_by,
      v.episode_id, v.published_at, v.last_scraped_at, v.created_at,
      v.reviewed_by, v.reviewed_at, v.review_notes
    FROM cutter_videos v
    WHERE v.id = ?`,
    [id]
  );

  if (!videoResult.rows.length) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const r = videoResult.rows[0] as unknown[];
  const video = {
    id:                   val(r[0]),
    cutter_id:            val(r[1]),
    platform:             val(r[2]),
    external_id:          val(r[3]),
    url:                  val(r[4]),
    title:                val(r[5]),
    account_handle:       val(r[6]),
    current_views:        intVal(r[7]),
    views_at_last_invoice: intVal(r[8]),
    claimed_views:        intVal(r[9]),
    observed_views:       intVal(r[10]),
    api_views:            intVal(r[11]),
    verification_status:  val(r[12]),
    verification_source:  val(r[13]),
    confidence_level:     intVal(r[14]),
    discrepancy_status:   val(r[15]),
    discrepancy_percent:  floatVal(r[16]),
    is_flagged:           intVal(r[17]),
    flag_reason:          val(r[18]),
    proof_url:            val(r[19]),
    proof_status:         val(r[20]),
    proof_cutter_note:    val(r[21]),
    proof_rejection_reason: val(r[22]),
    proof_reviewer_id:    val(r[23]),
    proof_reviewer_name:  val(r[24]),
    proof_reviewed_at:    val(r[25]),
    proof_uploaded_at:    val(r[26]),
    proof_requested_at:   val(r[27]),
    proof_requested_by:   val(r[28]),
    episode_id:           val(r[29]),
    published_at:         val(r[30]),
    last_scraped_at:      val(r[31]),
    created_at:           val(r[32]),
    reviewed_by:          val(r[33]),
    reviewed_at:          val(r[34]),
    review_notes:         val(r[35]),
  };

  const cutterId  = video.cutter_id;
  const episodeId = video.episode_id;

  // Ensure proof_files table exists (DDL is idempotent)
  const ensureTableSql = `CREATE TABLE IF NOT EXISTS cutter_proof_files (
    id TEXT PRIMARY KEY, video_id TEXT NOT NULL, cutter_id TEXT NOT NULL,
    file_url TEXT NOT NULL, file_name TEXT, file_size INTEGER, mime_type TEXT,
    display_order INTEGER NOT NULL DEFAULT 0, uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`;

  const [cutterResult, episodeResult, snapshotsResult, auditResult, proofFilesResult] =
    await Promise.all([
      dbQuery(`SELECT id, name, email, rate_per_view FROM cutters WHERE id = ?`, [cutterId]),
      episodeId
        ? dbQuery(`SELECT id, title FROM episodes WHERE id = ?`, [episodeId])
        : Promise.resolve({ rows: [] }),
      dbQuery(
        `SELECT id, views, observed_views, api_views, claimed_views, verification_source,
                confidence_level, snapshot_type, success, error_message, scraped_at
         FROM cutter_view_snapshots
         WHERE video_id = ?
         ORDER BY scraped_at DESC LIMIT 20`,
        [id]
      ),
      dbQuery(
        `SELECT id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at
         FROM audit_log
         WHERE entity_type = 'video' AND entity_id = ?
         ORDER BY created_at DESC LIMIT 30`,
        [id]
      ),
      // Silently create table then query (with all review fields)
      dbQuery(ensureTableSql)
        .then(() => Promise.all([
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN proof_status TEXT NOT NULL DEFAULT 'uploaded'`, []).catch(() => {}),
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN uploader_note TEXT`, []).catch(() => {}),
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN reviewed_by_id TEXT`, []).catch(() => {}),
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN reviewed_by_name TEXT`, []).catch(() => {}),
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN reviewed_at TEXT`, []).catch(() => {}),
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN review_note TEXT`, []).catch(() => {}),
          dbQuery(`ALTER TABLE cutter_proof_files ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`, []).catch(() => {}),
        ]))
        .then(() =>
          dbQuery(
            `SELECT id, file_url, file_name, file_size, mime_type, uploaded_at,
                    proof_status, uploader_note,
                    reviewed_by_id, reviewed_by_name, reviewed_at, review_note
             FROM cutter_proof_files WHERE video_id = ?
             ORDER BY uploaded_at DESC LIMIT 1`,
            [id]
          )
        ),
    ]);

  const cr = cutterResult.rows[0] as unknown[];
  const cutter = cr ? {
    id: val(cr[0]), name: val(cr[1]), email: val(cr[2]), rate_per_view: floatVal(cr[3]),
  } : null;

  const er = episodeResult.rows[0] as unknown[] | undefined;
  const episode = er ? { id: val(er[0]), title: val(er[1]) } : null;

  const snapshots = snapshotsResult.rows.map((row: unknown[]) => ({
    id: val(row[0]), views: intVal(row[1]), observed_views: intVal(row[2]),
    api_views: intVal(row[3]), claimed_views: intVal(row[4]),
    verification_source: val(row[5]), confidence_level: intVal(row[6]),
    snapshot_type: val(row[7]), success: intVal(row[8]),
    error_message: val(row[9]), scraped_at: val(row[10]),
  }));

  const auditTrail = auditResult.rows.map((row: unknown[]) => ({
    id: val(row[0]), actor_id: val(row[1]), actor_name: val(row[2]),
    action: val(row[3]), entity_type: val(row[4]), entity_id: val(row[5]),
    meta: val(row[6]), created_at: val(row[7]),
  }));

  const pfRow = proofFilesResult.rows[0] as unknown[] | undefined;
  const proofFile = pfRow ? {
    id:               val(pfRow[0]),
    file_url:         val(pfRow[1]),   // resolved to signed URL below
    file_name:        val(pfRow[2]),
    file_size:        intVal(pfRow[3]),
    mime_type:        val(pfRow[4]),
    uploaded_at:      val(pfRow[5]),
    proof_status:     val(pfRow[6]),
    uploader_note:    val(pfRow[7]),
    reviewed_by_id:   val(pfRow[8]),
    reviewed_by_name: val(pfRow[9]),
    reviewed_at:      val(pfRow[10]),
    review_note:      val(pfRow[11]),
  } : null;

  // Resolve storage paths → fresh signed URLs (1-hour TTL) so the browser
  // can actually load the images. Raw paths like "videoId/ts-name.jpg" are
  // not directly accessible — only signed https:// URLs work.
  if (proofFile?.file_url) {
    try {
      proofFile.file_url = await resolveProofUrl(proofFile.file_url);
    } catch {
      // Non-fatal: leave raw path; image will show as broken rather than crash
    }
  }
  if (video.proof_url) {
    try {
      video.proof_url = await resolveProofUrl(video.proof_url);
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json({ video, cutter, episode, snapshots, auditTrail, proofFile });
}
