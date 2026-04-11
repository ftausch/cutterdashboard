import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, requirePermission, isCutter } from '@/lib/cutter/middleware';
import { can, type Role } from '@/lib/permissions';
import { ensureDb } from '@/lib/db';
import { parsePlatformUrl } from '@/lib/cutter/helpers';
import { scrapeVideoViews } from '@/lib/cutter/scraper';
import { writeAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT *, (current_views - views_at_last_invoice) as unbilled_views
       FROM cutter_videos WHERE cutter_id = ? ORDER BY created_at DESC`,
    args: [auth.id],
  });

  // Strip ops-only sensitive fields for cutter / viewer roles
  const hasSensitiveAccess = can(auth.role as Role, 'CLIP_SENSITIVE_FIELDS');
  const videos = hasSensitiveAccess
    ? result.rows
    : result.rows.map((row) => {
        const { discrepancy_percent, confidence_level, flag_reason, review_notes, ...rest } =
          row as Record<string, unknown>;
        void discrepancy_percent; void confidence_level; void flag_reason; void review_notes;
        return rest;
      });

  return NextResponse.json({ videos });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'CLIP_SUBMIT');
  if (!isCutter(auth)) return auth;

  const { urls } = await request.json();

  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'URLs erforderlich' }, { status: 400 });
  }

  if (urls.length > 50) {
    return NextResponse.json({ error: 'Maximal 50 URLs pro Anfrage' }, { status: 400 });
  }

  const db = await ensureDb();
  const accepted: Array<{ id: string; url: string; platform: string }> = [];
  const rejected: Array<{ url: string; reason: string }> = [];

  // Load cutter's verified accounts
  const accountsResult = await db.execute({
    sql: `SELECT platform, account_handle FROM cutter_accounts WHERE cutter_id = ?`,
    args: [auth.id],
  });
  const accounts = accountsResult.rows as Array<{ platform: string; account_handle: string }>;

  const accountMap = new Map(accounts.map((a) => [a.platform, a.account_handle.toLowerCase()]));

  for (const rawUrl of urls) {
    const url = (rawUrl as string).trim();
    if (!url) continue;

    // 1. Parse URL
    const parsed = parsePlatformUrl(url);
    if (!parsed) {
      rejected.push({ url, reason: 'URL-Format nicht erkannt' });
      continue;
    }

    // 2. Check account verification
    const verifiedHandle = accountMap.get(parsed.platform);
    if (!verifiedHandle) {
      rejected.push({
        url,
        reason: `Kein ${parsed.platform}-Konto verknüpft. Bitte zuerst unter "Konten" verknüpfen.`,
      });
      continue;
    }

    // If we can extract account handle from URL, verify it matches
    if (parsed.accountHandle) {
      if (parsed.accountHandle.toLowerCase() !== verifiedHandle) {
        rejected.push({
          url,
          reason: `Video gehört zu @${parsed.accountHandle}, nicht zu deinem verknüpften Konto @${verifiedHandle}`,
        });
        continue;
      }
    }

    // 3. Check for duplicates
    const existingResult = await db.execute({
      sql: `SELECT id, cutter_id FROM cutter_videos WHERE platform = ? AND external_id = ?`,
      args: [parsed.platform, parsed.externalId],
    });
    const existing = existingResult.rows[0] as { id: string; cutter_id: string } | undefined;

    if (existing) {
      const dupMsg =
        existing.cutter_id === auth.id
          ? 'Video bereits eingereicht'
          : 'Video wurde bereits von einem anderen Cutter eingereicht';
      rejected.push({ url, reason: dupMsg });
      continue;
    }

    // 4. Insert video
    const videoId = randomUUID();
    await db.execute({
      sql: `INSERT INTO cutter_videos (id, cutter_id, platform, external_id, url, account_handle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [videoId, auth.id, parsed.platform, parsed.externalId, url, parsed.accountHandle],
    });

    accepted.push({ id: videoId, url, platform: parsed.platform });

    // Notification: clip submitted
    await createNotification(db, {
      recipientId: auth.id,
      type: 'clip_submitted',
      title: 'Clip eingereicht',
      body: `Dein ${parsed.platform}-Clip wurde erfolgreich eingereicht. Views werden automatisch getrackt.`,
      actionUrl: '/videos',
      entityType: 'video',
      entityId: videoId,
      dedupWindowHours: 1,
    });

    // Audit log
    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'video_submit',
      entityType: 'video',
      entityId: videoId,
      meta: { platform: parsed.platform, url },
    });

    // 5. Initial scrape (best-effort, don't fail the submission)
    try {
      const scraped = await scrapeVideoViews(parsed.platform, parsed.externalId, url);
      if (scraped.views !== null) {
        await db.execute({
          sql: `UPDATE cutter_videos SET current_views = ?, title = ?, first_scraped_at = datetime('now'), last_scraped_at = datetime('now')
           WHERE id = ?`,
          args: [scraped.views, scraped.title || null, videoId],
        });
      }
      // Record snapshot
      await db.execute({
        sql: `INSERT INTO cutter_view_snapshots (id, video_id, views, success, error_message, scraped_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        args: [
          randomUUID(),
          videoId,
          scraped.views,
          scraped.views !== null ? 1 : 0,
          scraped.error || null,
        ],
      });
    } catch (err) {
      console.warn(`Initial scrape failed for ${url}:`, err);
    }
  }

  return NextResponse.json({ accepted, rejected });
}
