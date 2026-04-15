/**
 * Sync Engine — Herzstück des automatischen Trackings
 *
 * Läuft täglich um 04:00 Uhr via Vercel Cron Job.
 * Kann auch manuell über /api/admin/sync ausgelöst werden.
 *
 * Was es tut:
 * 1. Alle aktiven Klipper-Accounts laden
 * 2. Per Plattform die neuesten Videos + Views ziehen
 * 3. Neue Videos anlegen, bestehende Views updaten
 * 4. Sync-Log schreiben
 */

import { randomUUID } from 'crypto';
import type { SyncResult, CutterAccount, VideoData } from './types';
import { resolveYouTubeChannel, fetchYouTubeVideos } from './youtube';
import { scrapeVideoViews } from '@/lib/cutter/scraper';

// ─── Turso DB client (direct HTTP) ───────────────────────────────────────────

async function dbQuery(sql: string, args: unknown[] = []) {
  const url = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;

  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map((a) =>
              a === null
                ? { type: 'null' }
                : typeof a === 'number'
                ? { type: 'integer', value: String(a) }
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
  return result?.response?.result ?? { rows: [] };
}

// ─── Load all active cutter accounts ─────────────────────────────────────────

async function loadCutterAccounts(): Promise<CutterAccount[]> {
  const result = await dbQuery(`
    SELECT
      ca.id,
      ca.cutter_id,
      c.name as cutter_name,
      ca.platform,
      ca.account_handle,
      ca.account_url,
      ca.youtube_channel_id,
      ca.oauth_access_token,
      ca.platform_user_id
    FROM cutter_accounts ca
    JOIN cutters c ON c.id = ca.cutter_id
    WHERE c.is_active = 1
    ORDER BY ca.platform, c.name
  `);

  return result.rows.map((row: unknown[]) => ({
    id: (row[0] as { value: string }).value,
    cutterId: (row[1] as { value: string }).value,
    cutterName: (row[2] as { value: string }).value,
    platform: (row[3] as { value: string }).value as CutterAccount['platform'],
    accountHandle: (row[4] as { value: string }).value,
    accountUrl: (row[5] as { value: string | null }).value,
    youtubeChannelId: (row[6] as { value: string | null }).value,
    oauthAccessToken: (row[7] as { value: string | null }).value,
    instagramUserId: (row[8] as { value: string | null }).value ?? null,
  }));
}

// ─── Fetch existing videos for scraper-based sync ────────────────────────────

async function fetchExistingVideos(
  cutterId: string,
  platform: string
): Promise<Array<{ externalId: string; url: string; title: string; publishedAt: string | null }>> {
  const result = await dbQuery(
    `SELECT external_id, url, COALESCE(title, '') as title, published_at
     FROM cutter_videos
     WHERE cutter_id = ? AND platform = ?
     ORDER BY published_at DESC
     LIMIT 50`,
    [cutterId, platform]
  );
  return result.rows.map((row: unknown[]) => ({
    externalId: (row[0] as { value: string }).value,
    url: (row[1] as { value: string }).value,
    title: (row[2] as { value: string }).value ?? '',
    publishedAt: (row[3] as { value: string | null }).value,
  }));
}

// ─── Upsert videos into DB ────────────────────────────────────────────────────

async function upsertVideos(
  cutterId: string,
  accountHandle: string,
  videos: VideoData[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const video of videos) {
    // Check if video already exists
    const existing = await dbQuery(
      `SELECT id, current_views FROM cutter_videos WHERE platform = ? AND external_id = ?`,
      [video.platform, video.externalId]
    );

    if (existing.rows.length > 0) {
      // Update view count
      const existingId = (existing.rows[0][0] as { value: string }).value;
      await dbQuery(
        `UPDATE cutter_videos
         SET current_views = ?,
             last_scraped_at = datetime('now'),
             auto_synced = 1
         WHERE id = ?`,
        [video.viewCount, existingId]
      );
      updated++;
    } else {
      // Create new video
      const id = randomUUID();
      await dbQuery(
        `INSERT INTO cutter_videos
          (id, cutter_id, platform, external_id, url, title, account_handle,
           current_views, published_at, first_scraped_at, last_scraped_at,
           auto_synced, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 1, 'unverified')`,
        [
          id,
          cutterId,
          video.platform,
          video.externalId,
          video.url,
          video.title || '',
          accountHandle,
          video.viewCount,
          video.publishedAt,
        ]
      );
      created++;
    }
  }

  return { created, updated };
}

// ─── Mark account sync result ─────────────────────────────────────────────────

async function updateAccountSyncStatus(
  accountId: string,
  error?: string,
  channelId?: string
) {
  await dbQuery(
    `UPDATE cutter_accounts
     SET last_synced_at = datetime('now'),
         sync_error = ?,
         youtube_channel_id = COALESCE(?, youtube_channel_id)
     WHERE id = ?`,
    [error ?? null, channelId ?? null, accountId]
  );
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function runSync(): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const accounts = await loadCutterAccounts();

  for (const account of accounts) {
    const start = Date.now();
    let videos: VideoData[] = [];
    let error: string | undefined;

    try {
      if (account.platform === 'youtube') {
        // Resolve channel ID if we don't have it yet
        let channelId = account.youtubeChannelId;

        if (!channelId) {
          const resolved = await resolveYouTubeChannel(
            account.accountUrl ?? account.accountHandle
          );
          if (!resolved) {
            throw new Error(
              `YouTube-Kanal nicht gefunden: "${account.accountHandle}"`
            );
          }
          channelId = resolved.channelId;
          await updateAccountSyncStatus(account.id, undefined, channelId);
        }

        // Fetch all videos from the uploads playlist
        // The uploads playlist ID is "UU" + channelId[2:]
        const uploadsPlaylistId = 'UU' + channelId.slice(2);
        videos = await fetchYouTubeVideos(uploadsPlaylistId);

      } else if (account.platform === 'tiktok') {
        const existing = await fetchExistingVideos(account.cutterId, 'tiktok');
        if (existing.length === 0) {
          error = 'Keine TikTok-Videos zum Aktualisieren vorhanden';
        } else {
          for (const v of existing) {
            const r = await scrapeVideoViews('tiktok', v.externalId, v.url);
            if (r.views !== null) {
              videos.push({ externalId: v.externalId, url: v.url, title: r.title ?? v.title, viewCount: r.views, publishedAt: v.publishedAt, platform: 'tiktok' });
            }
            await new Promise(res => setTimeout(res, 300));
          }
        }

      } else if (account.platform === 'instagram') {
        if (!account.oauthAccessToken) {
          error = 'Instagram nicht verbunden (OAuth fehlt)';
        } else {
          const existing = await fetchExistingVideos(account.cutterId, 'instagram');
          for (const v of existing) {
            const r = await scrapeVideoViews('instagram', v.externalId, v.url, account.oauthAccessToken, account.instagramUserId ?? undefined);
            if (r.views !== null) {
              videos.push({ externalId: v.externalId, url: v.url, title: r.title ?? v.title, viewCount: r.views, publishedAt: v.publishedAt, platform: 'instagram' });
            }
            await new Promise(res => setTimeout(res, 300));
          }
          if (videos.length === 0 && existing.length === 0) {
            error = 'Keine Instagram-Videos zum Aktualisieren vorhanden';
          }
        }

      } else if (account.platform === 'facebook') {
        const existing = await fetchExistingVideos(account.cutterId, 'facebook');
        if (existing.length === 0) {
          error = 'Keine Facebook-Videos zum Aktualisieren vorhanden';
        } else {
          for (const v of existing) {
            const r = await scrapeVideoViews('facebook', v.externalId, v.url);
            if (r.views !== null) {
              videos.push({ externalId: v.externalId, url: v.url, title: r.title ?? v.title, viewCount: r.views, publishedAt: v.publishedAt, platform: 'facebook' });
            }
            await new Promise(res => setTimeout(res, 300));
          }
        }
      }

    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    // Upsert videos into DB
    let created = 0;
    let updated = 0;
    if (videos.length > 0) {
      const counts = await upsertVideos(
        account.cutterId,
        account.accountHandle,
        videos
      );
      created = counts.created;
      updated = counts.updated;
    }

    // Update account sync status
    await updateAccountSyncStatus(account.id, error);

    results.push({
      cutterId: account.cutterId,
      cutterName: account.cutterName,
      platform: account.platform,
      accountHandle: account.accountHandle,
      videosFound: videos.length,
      videosCreated: created,
      videosUpdated: updated,
      error,
      durationMs: Date.now() - start,
    });
  }

  return results;
}

// ─── Write to sync_log ────────────────────────────────────────────────────────

export async function writeSyncLog(
  results: SyncResult[],
  totalMs: number
): Promise<void> {
  const summary = {
    accounts: results.length,
    totalVideosFound: results.reduce((s, r) => s + r.videosFound, 0),
    totalCreated: results.reduce((s, r) => s + r.videosCreated, 0),
    totalUpdated: results.reduce((s, r) => s + r.videosUpdated, 0),
    errors: results.filter((r) => r.error).map((r) => ({
      cutter: r.cutterName,
      platform: r.platform,
      error: r.error,
    })),
    details: results,
  };

  await dbQuery(
    `UPDATE sync_log SET status = 'done', result = ?, finished_at = datetime('now'), duration_ms = ?
     WHERE id = (SELECT MAX(id) FROM sync_log WHERE sync_type = 'views')`,
    [JSON.stringify(summary), totalMs]
  );
}

export async function startSyncLog(): Promise<void> {
  await dbQuery(
    `INSERT INTO sync_log (sync_type, status) VALUES ('views', 'running')`
  );
}
