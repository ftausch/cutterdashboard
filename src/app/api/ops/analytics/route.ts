import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');   // filter by platform
  const cutterId = searchParams.get('cutter_id');  // filter by cutter
  const topic    = searchParams.get('topic');       // filter by topic
  // date range: videos published after/before these dates
  const dateFrom = searchParams.get('date_from');
  const dateTo   = searchParams.get('date_to');

  const db = await ensureDb();

  // Build WHERE clause for all queries
  const filters: string[] = ['v.current_views IS NOT NULL'];
  const filterArgs: (string | null)[] = [];

  if (platform) {
    filters.push('v.platform = ?');
    filterArgs.push(platform);
  }
  if (cutterId) {
    filters.push('v.cutter_id = ?');
    filterArgs.push(cutterId);
  }
  if (topic) {
    filters.push('a.topic = ?');
    filterArgs.push(topic);
  }
  if (dateFrom) {
    filters.push("v.published_at >= ?");
    filterArgs.push(dateFrom);
  }
  if (dateTo) {
    filters.push("v.published_at <= ?");
    filterArgs.push(dateTo);
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const baseJoin = `
    FROM cutter_videos v
    LEFT JOIN clip_attributes a ON a.video_id = v.id
    LEFT JOIN cutters c ON c.id = v.cutter_id
  `;

  // Run all analytics queries in parallel
  const [
    overallResult,
    byPlatformResult,
    byCutterResult,
    byHookResult,
    byAngleResult,
    byLengthResult,
    byCtaResult,
    byTopicResult,
    topClipsResult,
    recentEpisodesResult,
  ] = await Promise.all([

    // 1. Overall totals
    db.execute({
      sql: `SELECT
              COUNT(*) as total_clips,
              COALESCE(SUM(v.current_views), 0) as total_verified_views,
              COALESCE(SUM(v.claimed_views), 0) as total_claimed_views,
              COALESCE(AVG(v.confidence_level), 0) as avg_confidence,
              SUM(CASE WHEN v.verification_status IN ('verified','manual_proof') THEN 1 ELSE 0 END) as verified_clips,
              SUM(CASE WHEN v.discrepancy_status IN ('suspicious_difference','critical_difference') THEN 1 ELSE 0 END) as flagged_clips
            ${baseJoin}
            ${whereClause}`,
      args: filterArgs,
    }),

    // 2. By platform
    db.execute({
      sql: `SELECT
              v.platform,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(SUM(v.claimed_views), 0) as claimed_views,
              COALESCE(AVG(v.confidence_level), 0) as avg_confidence
            ${baseJoin}
            ${whereClause}
            GROUP BY v.platform
            ORDER BY views DESC`,
      args: filterArgs,
    }),

    // 3. By cutter
    db.execute({
      sql: `SELECT
              c.id as cutter_id,
              c.name as cutter_name,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(SUM(v.claimed_views), 0) as claimed_views,
              COALESCE(AVG(v.current_views), 0) as avg_views_per_clip
            ${baseJoin}
            ${whereClause}
            GROUP BY c.id, c.name
            ORDER BY views DESC`,
      args: filterArgs,
    }),

    // 4. By hook type (only clips with attribute set)
    db.execute({
      sql: `SELECT
              a.hook_type,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(AVG(v.current_views), 0) as avg_views
            ${baseJoin}
            ${whereClause}
              AND a.hook_type IS NOT NULL
            GROUP BY a.hook_type
            ORDER BY views DESC`,
      args: filterArgs,
    }),

    // 5. By content angle
    db.execute({
      sql: `SELECT
              a.content_angle,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(AVG(v.current_views), 0) as avg_views
            ${baseJoin}
            ${whereClause}
              AND a.content_angle IS NOT NULL
            GROUP BY a.content_angle
            ORDER BY views DESC`,
      args: filterArgs,
    }),

    // 6. By clip length bucket
    db.execute({
      sql: `SELECT
              a.clip_length_bucket,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(AVG(v.current_views), 0) as avg_views
            ${baseJoin}
            ${whereClause}
              AND a.clip_length_bucket IS NOT NULL
            GROUP BY a.clip_length_bucket
            ORDER BY views DESC`,
      args: filterArgs,
    }),

    // 7. By CTA type
    db.execute({
      sql: `SELECT
              a.cta_type,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(AVG(v.current_views), 0) as avg_views
            ${baseJoin}
            ${whereClause}
              AND a.cta_type IS NOT NULL
            GROUP BY a.cta_type
            ORDER BY views DESC`,
      args: filterArgs,
    }),

    // 8. By topic (top 20)
    db.execute({
      sql: `SELECT
              a.topic,
              COUNT(*) as clips,
              COALESCE(SUM(v.current_views), 0) as views,
              COALESCE(AVG(v.current_views), 0) as avg_views
            ${baseJoin}
            ${whereClause}
              AND a.topic IS NOT NULL
            GROUP BY a.topic
            ORDER BY views DESC
            LIMIT 20`,
      args: filterArgs,
    }),

    // 9. Top 20 clips by views
    db.execute({
      sql: `SELECT
              v.id, v.title, v.url, v.platform,
              v.current_views, v.claimed_views,
              v.verification_status, v.discrepancy_status, v.discrepancy_percent,
              c.name as cutter_name,
              a.hook_type, a.content_angle, a.clip_length_bucket, a.topic, a.guest,
              e.title as episode_title
            ${baseJoin}
            LEFT JOIN episodes e ON e.id = v.episode_id
            ${whereClause}
            ORDER BY v.current_views DESC
            LIMIT 20`,
      args: filterArgs,
    }),

    // 10. Recent episodes with performance
    db.execute({
      sql: `SELECT
              ep.id, ep.title, ep.platform, ep.created_at,
              COUNT(v.id) as clip_count,
              COALESCE(SUM(v.current_views), 0) as total_views,
              COALESCE(SUM(v.claimed_views), 0) as claimed_views,
              c.name as cutter_name
            FROM episodes ep
            LEFT JOIN cutter_videos v ON v.episode_id = ep.id
            LEFT JOIN cutters c ON c.id = ep.cutter_id
            GROUP BY ep.id, ep.title, ep.platform, ep.created_at, c.name
            ORDER BY total_views DESC
            LIMIT 10`,
      args: [],
    }),
  ]);

  const overall = overallResult.rows[0] ?? {};

  return NextResponse.json({
    overall: {
      total_clips: (overall.total_clips as number) ?? 0,
      total_verified_views: (overall.total_verified_views as number) ?? 0,
      total_claimed_views: (overall.total_claimed_views as number) ?? 0,
      avg_confidence: Math.round((overall.avg_confidence as number) ?? 0),
      verified_clips: (overall.verified_clips as number) ?? 0,
      flagged_clips: (overall.flagged_clips as number) ?? 0,
    },
    byPlatform:     byPlatformResult.rows,
    byCutter:       byCutterResult.rows,
    byHookType:     byHookResult.rows,
    byContentAngle: byAngleResult.rows,
    byLengthBucket: byLengthResult.rows,
    byCtaType:      byCtaResult.rows,
    byTopic:        byTopicResult.rows,
    topClips:       topClipsResult.rows,
    recentEpisodes: recentEpisodesResult.rows,
    // Echo back applied filters
    filters: { platform, cutterId, topic, dateFrom, dateTo },
  });
}
