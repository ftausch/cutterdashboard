import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';
import { can, type Role } from '@/lib/permissions';

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

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore.get('cutter_session')?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role as Role, 'OPS_READ')) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cutter = searchParams.get('cutter');
  const platform = searchParams.get('platform');
  const status = searchParams.get('status');
  const discrepancy = searchParams.get('discrepancy');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const episode = searchParams.get('episode');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const args: unknown[] = [];

  if (cutter) { conditions.push('v.cutter_id = ?'); args.push(cutter); }
  if (platform) { conditions.push('v.platform = ?'); args.push(platform); }
  if (status) { conditions.push('v.verification_status = ?'); args.push(status); }
  if (discrepancy) { conditions.push('v.discrepancy_status = ?'); args.push(discrepancy); }
  if (dateFrom) { conditions.push("date(v.created_at) >= date(?)"); args.push(dateFrom); }
  if (dateTo) { conditions.push("date(v.created_at) <= date(?)"); args.push(dateTo); }
  if (episode) { conditions.push('v.episode_id = ?'); args.push(episode); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await dbQuery(
    `SELECT COUNT(*) as total FROM cutter_videos v JOIN cutters c ON c.id = v.cutter_id LEFT JOIN episodes e ON e.id = v.episode_id ${where}`,
    args
  );
  const total = parseInt((countResult.rows[0] as unknown[])?.[0] ? ((countResult.rows[0] as unknown[])[0] as { value: string }).value : '0', 10);

  const listArgs = [...args, limit, offset];
  const result = await dbQuery(
    `SELECT
      v.id, v.cutter_id, v.platform, v.external_id, v.url, v.title,
      v.claimed_views, v.current_views, v.observed_views, v.api_views,
      v.verification_status, v.verification_source, v.confidence_level,
      v.discrepancy_status, v.discrepancy_percent,
      v.is_flagged, v.proof_status, v.last_scraped_at, v.published_at, v.created_at,
      c.name as cutter_name,
      e.title as episode_title
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    LEFT JOIN episodes e ON e.id = v.episode_id
    ${where}
    ORDER BY v.created_at DESC
    LIMIT ? OFFSET ?`,
    listArgs
  );

  const clips = result.rows.map((row: unknown[]) => ({
    id: val(row[0]),
    cutter_id: val(row[1]),
    platform: val(row[2]),
    external_id: val(row[3]),
    url: val(row[4]),
    title: val(row[5]),
    claimed_views: row[6] ? parseInt((row[6] as { value: string }).value, 10) : null,
    current_views: row[7] ? parseInt((row[7] as { value: string }).value, 10) : null,
    observed_views: row[8] ? parseInt((row[8] as { value: string }).value, 10) : null,
    api_views: row[9] ? parseInt((row[9] as { value: string }).value, 10) : null,
    verification_status: val(row[10]),
    verification_source: val(row[11]),
    confidence_level: row[12] ? parseInt((row[12] as { value: string }).value, 10) : null,
    discrepancy_status: val(row[13]),
    discrepancy_percent: row[14] ? parseFloat((row[14] as { value: string }).value) : null,
    is_flagged: row[15] ? parseInt((row[15] as { value: string }).value, 10) : 0,
    proof_status: val(row[16]),
    last_scraped_at: val(row[17]),
    published_at: val(row[18]),
    created_at: val(row[19]),
    cutter_name: val(row[20]),
    episode_title: val(row[21]),
  }));

  // Stats for filtered set
  const statsResult = await dbQuery(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN v.verification_status = 'verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN v.discrepancy_status IN ('suspicious_difference','critical_difference') THEN 1 ELSE 0 END) as suspicious_critical,
      AVG(CASE WHEN v.confidence_level IS NOT NULL THEN v.confidence_level ELSE NULL END) as avg_confidence
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    LEFT JOIN episodes e ON e.id = v.episode_id
    ${where}`,
    args
  );

  const statsRow = statsResult.rows[0] as unknown[];
  const stats = {
    total: parseInt((statsRow?.[0] as { value: string })?.value ?? '0', 10),
    verified: parseInt((statsRow?.[1] as { value: string })?.value ?? '0', 10),
    suspicious_critical: parseInt((statsRow?.[2] as { value: string })?.value ?? '0', 10),
    avg_confidence: statsRow?.[3] ? Math.round(parseFloat((statsRow[3] as { value: string }).value)) : null,
  };

  return NextResponse.json({
    clips,
    stats,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
