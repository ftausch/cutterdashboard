/**
 * POST /api/sync/views
 * User-triggered view sync — fetches fresh view counts for all of the
 * authenticated cutter's videos via the platform scrapers.
 *
 * The nightly cron (/api/cron/sync-views) does this for every user automatically.
 * This endpoint lets a user trigger an on-demand refresh.
 *
 * Rate-limited: max once per 10 minutes per user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { scrapeVideoViews } from '@/lib/cutter/scraper';
import {
  resolveVerificationSource,
  resolveVerificationStatus,
  calculateDiscrepancy,
} from '@/lib/verification/discrepancy';
import type { DiscrepancyStatus } from '@/lib/verification/types';

const COOLDOWN_MINUTES = 10;

interface VideoRow {
  id: string;
  platform: string;
  external_id: string;
  url: string;
  claimed_views: number | null;
  last_scraped_at: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  // ── Cooldown check ─────────────────────────────────────────
  const recentSync = await db.execute({
    sql: `SELECT MAX(last_scraped_at) as last_sync
          FROM cutter_videos
          WHERE cutter_id = ? AND last_scraped_at IS NOT NULL`,
    args: [auth.id],
  });

  const lastSync = (recentSync.rows[0] as Record<string, unknown>)?.last_sync as string | null;
  if (lastSync) {
    const minutesSince = (Date.now() - new Date(lastSync + 'Z').getTime()) / 60_000;
    if (minutesSince < COOLDOWN_MINUTES) {
      return NextResponse.json({
        error: `Bitte warte noch ${Math.ceil(COOLDOWN_MINUTES - minutesSince)} Minute(n) bis zum nächsten Sync.`,
        cooldown: true,
        nextSyncIn: Math.ceil(COOLDOWN_MINUTES - minutesSince),
      }, { status: 429 });
    }
  }

  // ── Load this user's videos ────────────────────────────────
  const videosResult = await db.execute({
    sql: `SELECT id, platform, external_id, url, claimed_views, last_scraped_at
          FROM cutter_videos WHERE cutter_id = ?`,
    args: [auth.id],
  });
  const videos = videosResult.rows as unknown as VideoRow[];

  if (videos.length === 0) {
    return NextResponse.json({ message: 'Keine Videos vorhanden.', updated: 0, failed: 0 });
  }

  // ── Load OAuth tokens for Instagram ───────────────────────
  const igResult = await db.execute({
    sql: `SELECT oauth_access_token, instagram_user_id
          FROM cutter_accounts
          WHERE cutter_id = ? AND platform = 'instagram'
            AND oauth_access_token IS NOT NULL`,
    args: [auth.id],
  });
  const igRow = igResult.rows[0] as Record<string, unknown> | undefined;
  const igToken  = igRow?.oauth_access_token as string | undefined;
  const igUserId = igRow?.instagram_user_id  as string | undefined;

  // ── Scrape all videos ──────────────────────────────────────
  let updated = 0;
  let failed  = 0;
  const details: Array<{ id: string; platform: string; views: number | null; error?: string }> = [];

  const stmts: Array<{ sql: string; args: unknown[] }> = [];

  for (const video of videos) {
    const result = await scrapeVideoViews(
      video.platform,
      video.external_id,
      video.url,
      video.platform === 'instagram' ? igToken    : undefined,
      video.platform === 'instagram' ? igUserId   : undefined,
    );

    const success = result.views !== null;

    // ── Compute verification status ────────────────────────
    const source = resolveVerificationSource(
      video.platform,
      video.platform === 'youtube',         // YouTube → official_api
      success && video.platform !== 'youtube', // others → third_party_scraper
      false,
      video.claimed_views !== null,
    );

    const { status: discrepancyStatus, percent: discrepancyPercent } = success
      ? calculateDiscrepancy(result.views, video.claimed_views, source)
      : { status: 'cannot_verify' as DiscrepancyStatus, percent: null };

    const verificationStatus = resolveVerificationStatus(source, discrepancyStatus, null);

    // ── Write snapshot ─────────────────────────────────────
    stmts.push({
      sql: `INSERT INTO cutter_view_snapshots
              (id, video_id, views, success, error_message, scraped_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      args: [randomUUID(), video.id, result.views, success ? 1 : 0, result.error || null],
    });

    // ── Update video row ───────────────────────────────────
    if (success) {
      stmts.push({
        sql: `UPDATE cutter_videos
              SET current_views       = ?,
                  title               = COALESCE(?, title),
                  last_scraped_at     = datetime('now'),
                  verification_status = ?,
                  discrepancy_status  = ?,
                  discrepancy_percent = ?
              WHERE id = ?`,
        args: [
          result.views,
          (result as { title?: string }).title || null,
          verificationStatus,
          discrepancyStatus !== 'cannot_verify' ? discrepancyStatus : null,
          discrepancyPercent,
          video.id,
        ],
      });
      updated++;
    } else {
      stmts.push({
        sql: `UPDATE cutter_videos SET verification_status = ?, last_scraped_at = datetime('now') WHERE id = ?`,
        args: [verificationStatus, video.id],
      });
      failed++;
    }

    details.push({ id: video.id, platform: video.platform, views: result.views, error: result.error });

    // Brief pause to avoid rate-limits
    await new Promise((r) => setTimeout(r, 150));
  }

  await db.transaction(stmts);

  return NextResponse.json({
    updated,
    failed,
    total: videos.length,
    syncedAt: new Date().toISOString(),
    details,
  });
}
