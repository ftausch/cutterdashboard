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

  const [episodeResult, clipsResult, aggregatesResult] = await Promise.all([
    dbQuery(
      `SELECT e.id, e.title, e.description, e.platform, e.created_at,
              c.id as cutter_id, c.name as cutter_name
       FROM episodes e JOIN cutters c ON c.id = e.cutter_id
       WHERE e.id = ?`,
      [id]
    ),
    dbQuery(
      `SELECT v.id, v.platform, v.url, v.title, v.current_views, v.claimed_views,
              v.observed_views, v.api_views, v.verification_status, v.verification_source,
              v.confidence_level, v.discrepancy_status, v.discrepancy_percent, v.is_flagged,
              v.last_scraped_at, v.created_at, c.name as cutter_name
       FROM cutter_videos v
       JOIN cutters c ON c.id = v.cutter_id
       WHERE v.episode_id = ?
       ORDER BY v.current_views DESC`,
      [id]
    ),
    dbQuery(
      `SELECT
        COUNT(*) as total_clips,
        COALESCE(SUM(current_views), 0) as total_verified_views,
        COALESCE(SUM(claimed_views), 0) as total_claimed_views,
        COALESCE(SUM(CASE WHEN platform='tiktok' THEN current_views ELSE 0 END), 0) as tiktok_views,
        COALESCE(SUM(CASE WHEN platform='youtube' THEN current_views ELSE 0 END), 0) as youtube_views,
        COALESCE(SUM(CASE WHEN platform='instagram' THEN current_views ELSE 0 END), 0) as instagram_views,
        COALESCE(SUM(CASE WHEN platform='facebook' THEN current_views ELSE 0 END), 0) as facebook_views,
        SUM(CASE WHEN verification_status='verified' THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN discrepancy_status IN ('suspicious_difference','critical_difference') THEN 1 ELSE 0 END) as flagged_count
       FROM cutter_videos WHERE episode_id = ?`,
      [id]
    ),
  ]);

  if (!episodeResult.rows.length) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const r = episodeResult.rows[0] as unknown[];
  const episode = {
    id: val(r[0]),
    title: val(r[1]),
    description: val(r[2]),
    platform: val(r[3]),
    created_at: val(r[4]),
    cutter_id: val(r[5]),
    cutter_name: val(r[6]),
  };

  const clips = clipsResult.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    platform: val(row[1]),
    url: val(row[2]),
    title: val(row[3]),
    current_views: intVal(row[4]),
    claimed_views: intVal(row[5]),
    observed_views: intVal(row[6]),
    api_views: intVal(row[7]),
    verification_status: val(row[8]),
    verification_source: val(row[9]),
    confidence_level: intVal(row[10]),
    discrepancy_status: val(row[11]),
    discrepancy_percent: floatVal(row[12]),
    is_flagged: intVal(row[13]) ?? 0,
    last_scraped_at: val(row[14]),
    created_at: val(row[15]),
    cutter_name: val(row[16]),
  }));

  const aggRow = aggregatesResult.rows[0] as unknown[] | undefined;
  const aggregates = aggRow ? {
    total_clips: intVal(aggRow[0]) ?? 0,
    total_verified_views: intVal(aggRow[1]) ?? 0,
    total_claimed_views: intVal(aggRow[2]) ?? 0,
    tiktok_views: intVal(aggRow[3]) ?? 0,
    youtube_views: intVal(aggRow[4]) ?? 0,
    instagram_views: intVal(aggRow[5]) ?? 0,
    facebook_views: intVal(aggRow[6]) ?? 0,
    verified_count: intVal(aggRow[7]) ?? 0,
    flagged_count: intVal(aggRow[8]) ?? 0,
  } : {
    total_clips: 0,
    total_verified_views: 0,
    total_claimed_views: 0,
    tiktok_views: 0,
    youtube_views: 0,
    instagram_views: 0,
    facebook_views: 0,
    verified_count: 0,
    flagged_count: 0,
  };

  // Cutter breakdown (if multiple cutters)
  const cutterMap = new Map<string, { name: string; clips: number; views: number }>();
  for (const clip of clips) {
    const name = clip.cutter_name ?? 'Unbekannt';
    const key = name;
    const existing = cutterMap.get(key) ?? { name, clips: 0, views: 0 };
    existing.clips += 1;
    existing.views += clip.current_views ?? 0;
    cutterMap.set(key, existing);
  }
  const cutterBreakdown = Array.from(cutterMap.values()).sort((a, b) => b.views - a.views);

  return NextResponse.json({ episode, clips, aggregates, cutterBreakdown });
}
