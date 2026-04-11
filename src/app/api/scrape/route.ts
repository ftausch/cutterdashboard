import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ensureDb } from '@/lib/db';
import { scrapeAllCutterVideos } from '@/lib/cutter/scraper';
import { cleanExpiredSessions } from '@/lib/cutter/auth';
import {
  resolveVerificationSource,
  resolveVerificationStatus,
  calculateDiscrepancy,
  shouldAlert,
} from '@/lib/verification/discrepancy';
import type { DiscrepancyStatus } from '@/lib/verification/types';

interface VideoRow {
  id: string;
  cutter_id: string;
  platform: string;
  external_id: string;
  url: string;
  claimed_views: number | null;
}

export async function POST(request: NextRequest) {
  // Verify cron key
  const cronKey = process.env.CUTTER_CRON_KEY || process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-cron-key');

  if (cronKey && cronHeader !== cronKey && authHeader !== `Bearer ${cronKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = await ensureDb();

  // Get all active cutter videos with claimed_views
  const videosResult = await db.execute(
    `SELECT v.id, v.cutter_id, v.platform, v.external_id, v.url, v.claimed_views
     FROM cutter_videos v
     JOIN cutters c ON c.id = v.cutter_id
     WHERE c.is_active = 1`
  );
  const videos = videosResult.rows as unknown as VideoRow[];

  if (videos.length === 0) {
    return NextResponse.json({ message: 'No videos to scrape', total: 0 });
  }

  // Fetch Instagram OAuth tokens for cutters that have connected their account
  const igTokensResult = await db.execute(`
    SELECT ca.cutter_id, ca.oauth_access_token, ca.instagram_user_id
    FROM cutter_accounts ca
    WHERE ca.platform = 'instagram' AND ca.oauth_access_token IS NOT NULL
  `);
  const oauthTokens = new Map<string, { token: string; userId: string }>();
  for (const row of igTokensResult.rows as any[]) {
    if (row.oauth_access_token && row.instagram_user_id) {
      oauthTokens.set(row.cutter_id as string, {
        token: row.oauth_access_token as string,
        userId: row.instagram_user_id as string,
      });
    }
  }

  const { updated, failed, results } = await scrapeAllCutterVideos(videos, oauthTokens);

  // For alert deduplication: check which video IDs already have open alerts
  const videoIds = results.map((r) => r.id);
  const existingAlertsResult = videoIds.length > 0
    ? await db.execute(
        `SELECT video_id FROM alerts WHERE video_id IN (${videoIds.map(() => '?').join(',')}) AND alert_type = 'suspicious_claim' AND status = 'open'`,
        // @ts-ignore — execute accepts string + args via overload
      )
    : { rows: [] };

  // Build the set via a raw execute with args
  let existingAlertVideoIds = new Set<string>();
  if (videoIds.length > 0) {
    const alertCheckResult = await db.execute({
      sql: `SELECT video_id FROM alerts WHERE video_id IN (${videoIds.map(() => '?').join(',')}) AND alert_type = 'suspicious_claim' AND status = 'open'`,
      args: videoIds,
    });
    for (const row of alertCheckResult.rows as any[]) {
      existingAlertVideoIds.add(row.video_id as string);
    }
  }

  // Build stmts array for the transaction
  const stmts: Array<{ sql: string; args?: any[] }> = [];

  for (const result of results) {
    const video = videos.find((v) => v.id === result.id)!;
    const scrapeSuccess = result.views !== null;
    const source = resolveVerificationSource(
      video.platform,
      video.platform === 'youtube', // YouTube uses official API key
      scrapeSuccess && video.platform !== 'youtube', // others use scraping
      false,
      video.claimed_views !== null
    );

    const { status: discrepancyStatus, percent: discrepancyPercent } =
      scrapeSuccess
        ? calculateDiscrepancy(result.views, video.claimed_views, source)
        : { status: 'cannot_verify' as DiscrepancyStatus, percent: null };

    const verificationStatus = resolveVerificationStatus(source, discrepancyStatus, null);

    // Write snapshot for every result (success and failure)
    stmts.push({
      sql: `INSERT INTO cutter_view_snapshots (id, video_id, views, success, error_message, scraped_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        randomUUID(),
        result.id,
        result.views,
        scrapeSuccess ? 1 : 0,
        result.error || null,
      ],
    });

    // Update video record
    if (scrapeSuccess) {
      stmts.push({
        sql: `UPDATE cutter_videos
              SET current_views = ?,
                  title = COALESCE(?, title),
                  last_scraped_at = datetime('now'),
                  verification_status = ?,
                  discrepancy_status = ?,
                  discrepancy_percent = ?
              WHERE id = ?`,
        args: [
          result.views,
          result.title || null,
          verificationStatus,
          discrepancyStatus !== 'cannot_verify' ? discrepancyStatus : null,
          discrepancyPercent,
          result.id,
        ],
      });
    } else {
      // Update only verification status on failure
      stmts.push({
        sql: `UPDATE cutter_videos SET verification_status = ? WHERE id = ?`,
        args: [verificationStatus, result.id],
      });
    }

    // Generate alert if discrepancy is suspicious or critical and no open alert exists
    const alertInfo = shouldAlert(discrepancyStatus);
    if (alertInfo.alert && !existingAlertVideoIds.has(result.id)) {
      const pctLabel = discrepancyPercent !== null ? ` (${discrepancyPercent}%)` : '';
      stmts.push({
        sql: `INSERT INTO alerts (id, cutter_id, video_id, alert_type, severity, title, description, status, created_at)
              VALUES (?, ?, ?, 'suspicious_claim', ?, ?, ?, 'open', datetime('now'))`,
        args: [
          randomUUID(),
          video.cutter_id,
          result.id,
          alertInfo.severity,
          `Auffällige Diskrepanz bei Video-Views${pctLabel}`,
          `Gemeldete Views weichen ${discrepancyPercent !== null ? discrepancyPercent + '%' : 'erheblich'} vom verifizierten Wert ab. Status: ${discrepancyStatus}`,
        ],
      });
    }
  }

  await db.transaction(stmts);

  // Housekeeping
  await cleanExpiredSessions();
  await db.execute(`DELETE FROM cutter_view_snapshots WHERE scraped_at < datetime('now', '-365 days')`);

  return NextResponse.json({
    total: videos.length,
    updated,
    failed,
  });
}
