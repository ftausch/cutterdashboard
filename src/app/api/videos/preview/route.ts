/**
 * POST /api/videos/preview
 *
 * Given a raw URL, returns:
 *  - Parsed metadata (platform, videoId, displayHint)
 *  - oEmbed preview (title, thumbnail, author)
 *  - Duplicate check (whether this video is already in the system)
 *
 * Called on paste/type in the submit form for instant feedback.
 * Designed to be fast — 5s total timeout.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { parseClipUrl, type ParseError } from '@/lib/ingest/parser';
import { ensureDb } from '@/lib/db';

export interface PreviewResponse {
  ok: true;
  platform: string;
  videoId: string;
  accountHandle: string | null;
  normalizedUrl: string;
  displayHint: string;
  isShortUrl: boolean;
  // oEmbed enrichment (may be null if unavailable)
  title: string | null;
  thumbnail: string | null;
  channelName: string | null;
  // Duplicate check
  duplicate: null | {
    id: string;
    title: string | null;
    current_views: number;
    created_at: string;
  };
}

export interface PreviewError {
  ok: false;
  code: string;
  message: string;
}

// ── oEmbed fetchers ───────────────────────────────────────────

async function fetchOEmbed(url: string): Promise<{
  title?: string;
  thumbnail?: string;
  author?: string;
} | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title:     data.title?.slice(0, 140) || undefined,
      thumbnail: data.thumbnail_url || undefined,
      author:    (data.author_name || data.provider_name)?.slice(0, 80) || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getYouTubePreview(videoId: string): Promise<{ title?: string; thumbnail?: string; author?: string } | null> {
  // Try YouTube oEmbed (no API key needed for basic metadata)
  const shortUrl = `https://www.youtube.com/shorts/${videoId}`;
  const oembed = await fetchOEmbed(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(shortUrl)}&format=json`
  );
  if (oembed?.title) return oembed;

  // Fallback: try watch URL
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  return fetchOEmbed(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`);
}

async function getTikTokPreview(normalizedUrl: string, isShortUrl: boolean): Promise<{ title?: string; thumbnail?: string; author?: string } | null> {
  if (isShortUrl) {
    // Can't reliably resolve short URLs server-side without following redirects cross-origin
    // Return minimal data — the full ID will come after actual submission
    return null;
  }
  return fetchOEmbed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(normalizedUrl)}`);
}

async function getInstagramPreview(normalizedUrl: string): Promise<{ title?: string; thumbnail?: string; author?: string } | null> {
  // Instagram oEmbed — works for public posts, no auth needed for basic metadata
  return fetchOEmbed(`https://api.instagram.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omitscript=true`);
}

async function getFacebookPreview(normalizedUrl: string, isShortUrl: boolean): Promise<{ title?: string; thumbnail?: string; author?: string } | null> {
  if (isShortUrl) return null;

  const fbToken = process.env.FACEBOOK_APP_TOKEN;
  if (!fbToken) return null;

  return fetchOEmbed(
    `https://graph.facebook.com/v19.0/oembed_video?url=${encodeURIComponent(normalizedUrl)}&access_token=${encodeURIComponent(fbToken)}`
  );
}

// ── Main handler ──────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse<PreviewResponse | PreviewError>> {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth as NextResponse<PreviewError>;

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_BODY', message: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body.url ?? '').trim();
  if (!raw) {
    return NextResponse.json({ ok: false, code: 'EMPTY_URL', message: 'URL is required' }, { status: 400 });
  }

  // 1. Parse the URL
  const parsed = parseClipUrl(raw);
  if (!parsed.ok) {
    const { code, messageDe } = parsed as ParseError;
    return NextResponse.json(
      { ok: false, code, message: messageDe },
      { status: 422 }
    );
  }

  // 2. Fetch oEmbed metadata (best-effort, non-blocking failure)
  let oembed: { title?: string; thumbnail?: string; author?: string } | null = null;
  try {
    switch (parsed.platform) {
      case 'youtube':
        oembed = await getYouTubePreview(parsed.videoId);
        break;
      case 'tiktok':
        oembed = await getTikTokPreview(parsed.normalizedUrl, parsed.isShortUrl);
        break;
      case 'instagram':
        oembed = await getInstagramPreview(parsed.normalizedUrl);
        break;
      case 'facebook':
        oembed = await getFacebookPreview(parsed.normalizedUrl, parsed.isShortUrl);
        break;
    }
  } catch {
    // oEmbed is optional — never fail because of it
  }

  // 3. Check for duplicates in DB
  let duplicate: PreviewResponse['duplicate'] = null;
  try {
    const db = await ensureDb();
    const dupResult = await db.execute({
      sql: `SELECT id, title, current_views, created_at
            FROM cutter_videos
            WHERE platform = ? AND external_id = ?
            LIMIT 1`,
      args: [parsed.platform, parsed.videoId],
    });
    if (dupResult.rows.length > 0) {
      const r = dupResult.rows[0] as Record<string, unknown>;
      duplicate = {
        id:           String(r.id ?? ''),
        title:        r.title ? String(r.title) : null,
        current_views: Number(r.current_views) || 0,
        created_at:   String(r.created_at ?? ''),
      };
    }
  } catch {
    // DB check is optional — don't block preview
  }

  return NextResponse.json({
    ok: true,
    platform:       parsed.platform,
    videoId:        parsed.videoId,
    accountHandle:  parsed.accountHandle,
    normalizedUrl:  parsed.normalizedUrl,
    displayHint:    parsed.displayHint,
    isShortUrl:     parsed.isShortUrl,
    title:          oembed?.title ?? null,
    thumbnail:      oembed?.thumbnail ?? null,
    channelName:    oembed?.author ?? null,
    duplicate,
  });
}
