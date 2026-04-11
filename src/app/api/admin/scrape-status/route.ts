import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  // Last scrape timestamp
  const lastScrapeResult = await db.execute(
    `SELECT MAX(scraped_at) as last_scraped_at FROM cutter_view_snapshots`
  );
  const lastScrapedAt = (lastScrapeResult.rows[0] as unknown as { last_scraped_at: string | null })?.last_scraped_at;

  // 24h success rate
  const stats24h = await db.execute(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as succeeded,
       SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
     FROM cutter_view_snapshots
     WHERE scraped_at >= datetime('now', '-1 day')`
  );
  const row = stats24h.rows[0] as unknown as { total: number; succeeded: number; failed: number };

  // Failures by platform (last 24h)
  const failuresByPlatform = await db.execute(
    `SELECT v.platform, COUNT(*) as count
     FROM cutter_view_snapshots s
     JOIN cutter_videos v ON v.id = s.video_id
     WHERE s.success = 0 AND s.scraped_at >= datetime('now', '-1 day')
     GROUP BY v.platform
     ORDER BY count DESC`
  );

  // Recent failures (last 10)
  const recentFailures = await db.execute(
    `SELECT s.scraped_at, s.error_message, v.platform, v.url, v.title
     FROM cutter_view_snapshots s
     JOIN cutter_videos v ON v.id = s.video_id
     WHERE s.success = 0
     ORDER BY s.scraped_at DESC
     LIMIT 10`
  );

  return NextResponse.json({
    lastScrapedAt,
    total24h: row.total,
    succeeded24h: row.succeeded,
    failed24h: row.failed,
    successRate24h: row.total > 0 ? Math.round((row.succeeded / row.total) * 100) : null,
    failuresByPlatform: failuresByPlatform.rows,
    recentFailures: recentFailures.rows,
  });
}
