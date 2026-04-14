import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';

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
      v.is_flagged, v.flag_reason, v.proof_url, v.proof_status, v.proof_notes,
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
    id: val(r[0]),
    cutter_id: val(r[1]),
    platform: val(r[2]),
    external_id: val(r[3]),
    url: val(r[4]),
    title: val(r[5]),
    account_handle: val(r[6]),
    current_views: intVal(r[7]),
    views_at_last_invoice: intVal(r[8]),
    claimed_views: intVal(r[9]),
    observed_views: intVal(r[10]),
    api_views: intVal(r[11]),
    verification_status: val(r[12]),
    verification_source: val(r[13]),
    confidence_level: intVal(r[14]),
    discrepancy_status: val(r[15]),
    discrepancy_percent: floatVal(r[16]),
    is_flagged: intVal(r[17]),
    flag_reason: val(r[18]),
    proof_url: val(r[19]),
    proof_status: val(r[20]),
    proof_notes: val(r[21]),
    episode_id: val(r[22]),
    published_at: val(r[23]),
    last_scraped_at: val(r[24]),
    created_at: val(r[25]),
    reviewed_by: val(r[26]),
    reviewed_at: val(r[27]),
    review_notes: val(r[28]),
  };

  const cutterId = video.cutter_id;
  const episodeId = video.episode_id;

  const [cutterResult, episodeResult, snapshotsResult, auditResult] = await Promise.all([
    dbQuery(
      `SELECT id, name, email, rate_per_view FROM cutters WHERE id = ?`,
      [cutterId]
    ),
    episodeId
      ? dbQuery(`SELECT id, title FROM episodes WHERE id = ?`, [episodeId])
      : Promise.resolve({ rows: [] }),
    dbQuery(
      `SELECT id, views, observed_views, api_views, claimed_views, verification_source,
              confidence_level, snapshot_type, success, error_message, scraped_at
       FROM cutter_view_snapshots
       WHERE video_id = ?
       ORDER BY scraped_at DESC
       LIMIT 20`,
      [id]
    ),
    dbQuery(
      `SELECT id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at
       FROM audit_log
       WHERE entity_type = 'video' AND entity_id = ?
       ORDER BY created_at DESC
       LIMIT 30`,
      [id]
    ),
  ]);

  const cr = cutterResult.rows[0] as unknown[];
  const cutter = cr ? {
    id: val(cr[0]),
    name: val(cr[1]),
    email: val(cr[2]),
    rate_per_view: floatVal(cr[3]),
  } : null;

  const er = episodeResult.rows[0] as unknown[] | undefined;
  const episode = er ? { id: val(er[0]), title: val(er[1]) } : null;

  const snapshots = snapshotsResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    views: intVal(row[1]),
    observed_views: intVal(row[2]),
    api_views: intVal(row[3]),
    claimed_views: intVal(row[4]),
    verification_source: val(row[5]),
    confidence_level: intVal(row[6]),
    snapshot_type: val(row[7]),
    success: intVal(row[8]),
    error_message: val(row[9]),
    scraped_at: val(row[10]),
  }));

  const auditTrail = auditResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    actor_id: val(row[1]),
    actor_name: val(row[2]),
    action: val(row[3]),
    entity_type: val(row[4]),
    entity_id: val(row[5]),
    meta: val(row[6]),
    created_at: val(row[7]),
  }));

  return NextResponse.json({ video, cutter, episode, snapshots, auditTrail });
}
