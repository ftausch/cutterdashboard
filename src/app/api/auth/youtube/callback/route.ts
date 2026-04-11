/**
 * GET /api/auth/youtube/callback
 * Handles Google OAuth 2.0 callback for YouTube connection.
 *
 * Flow:
 *  1. Validate state → session token
 *  2. Exchange code for access + refresh tokens
 *  3. Fetch YouTube channel info (id, title, handle)
 *  4. Test view access: list one video and check statistics
 *  5. Upsert cutter_accounts row with full capability data
 *  6. Redirect to /accounts with success/error param
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { getSessionFromCookie } from '@/lib/cutter/auth';
import { ensureDb } from '@/lib/db';

const APP_URL              = process.env.NEXT_PUBLIC_APP_URL || 'https://cutter-dashboard-six.vercel.app';
const YOUTUBE_CLIENT_ID    = process.env.YOUTUBE_CLIENT_ID    || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';

const REDIRECT_BASE = '/accounts';

function fail(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`${REDIRECT_BASE}?error=${code}`, request.url));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) return fail(request, 'youtube_denied');

  // CSRF: state must match the session cookie
  const cookieStore  = await cookies();
  const sessionToken = cookieStore.get('cutter_session')?.value;
  if (!state || state !== sessionToken) return fail(request, 'invalid_state');

  const cutter = await getSessionFromCookie(state);
  if (!cutter) return NextResponse.redirect(new URL('/login', request.url));
  if (!code)   return fail(request, 'youtube_failed');

  try {
    // ── Step 1: Exchange code for tokens ────────────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        redirect_uri:  `${APP_URL}/api/auth/youtube/callback`,
        grant_type:    'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('[YouTube OAuth] token exchange failed:', await tokenRes.text());
      return fail(request, 'youtube_failed');
    }

    const tokenData     = await tokenRes.json();
    const accessToken:  string = tokenData.access_token;
    const refreshToken: string = tokenData.refresh_token || '';
    const expiresIn:    number = tokenData.expires_in || 3600;
    const expiresAt:    string = new Date(Date.now() + expiresIn * 1000).toISOString();
    const scopes:       string = tokenData.scope || '';

    // ── Step 2: Fetch channel info ───────────────────────────────
    const channelRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=id,snippet,statistics&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!channelRes.ok) {
      console.error('[YouTube OAuth] channel fetch failed:', await channelRes.text());
      return fail(request, 'youtube_failed');
    }

    const channelData  = await channelRes.json();
    const channel      = channelData.items?.[0];
    if (!channel) return fail(request, 'youtube_no_channel');

    const channelId    = channel.id as string;
    const channelTitle = channel.snippet?.title as string ?? '';
    const channelHandle= (channel.snippet?.customUrl as string ?? '').replace(/^@/, '');

    // ── Step 3: Test view access — fetch one video to check statistics ──
    const videoTestRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=1&type=video`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let viewsAccessible = false;
    if (videoTestRes.ok) {
      const videoTestData = await videoTestRes.json();
      const sampleVideoId = videoTestData.items?.[0]?.id?.videoId;
      if (sampleVideoId) {
        const statsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${sampleVideoId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          viewsAccessible = typeof statsData.items?.[0]?.statistics?.viewCount === 'string';
        }
      } else {
        // Channel has no videos yet — but the scope is there, so views ARE accessible
        viewsAccessible = scopes.includes('youtube.readonly');
      }
    }

    const connectionStatus     = viewsAccessible ? 'connected' : 'connected_limited';
    const verificationConfidence = viewsAccessible ? 'high' : 'low';
    const capabilityFlags = JSON.stringify({
      official_api:         true,
      views_available:      viewsAccessible,
      video_list_available: true,
      clip_level_metrics:   viewsAccessible,
      scopes_granted:       scopes.split(' '),
    });

    // ── Step 4: Upsert cutter_accounts ──────────────────────────
    const db = await ensureDb();

    const existing = await db.execute({
      sql: `SELECT id FROM cutter_accounts WHERE cutter_id = ? AND platform = 'youtube'`,
      args: [cutter.id],
    });

    const handle = channelHandle || channelTitle.toLowerCase().replace(/\s+/g, '-');

    if (existing.rows[0]) {
      await db.execute({
        sql: `UPDATE cutter_accounts SET
                account_handle          = ?,
                youtube_channel_id      = ?,
                platform_user_id        = ?,
                oauth_access_token      = ?,
                oauth_refresh_token     = ?,
                oauth_token_expires_at  = ?,
                oauth_scopes            = ?,
                connection_status       = ?,
                connection_type         = 'oauth',
                views_accessible        = ?,
                verification_confidence = ?,
                capability_flags        = ?,
                sync_error              = NULL,
                updated_at              = datetime('now')
              WHERE cutter_id = ? AND platform = 'youtube'`,
        args: [
          handle, channelId, channelId,
          accessToken, refreshToken, expiresAt, scopes,
          connectionStatus, viewsAccessible ? 1 : 0, verificationConfidence,
          capabilityFlags,
          cutter.id,
        ],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO cutter_accounts (
                id, cutter_id, platform,
                account_handle, youtube_channel_id, platform_user_id,
                oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scopes,
                connection_status, connection_type,
                views_accessible, verification_confidence, capability_flags
              ) VALUES (?, ?, 'youtube', ?, ?, ?, ?, ?, ?, ?, ?, 'oauth', ?, ?, ?)`,
        args: [
          randomUUID(), cutter.id,
          handle, channelId, channelId,
          accessToken, refreshToken, expiresAt, scopes,
          connectionStatus,
          viewsAccessible ? 1 : 0, verificationConfidence,
          capabilityFlags,
        ],
      });
    }

    return NextResponse.redirect(new URL(`${REDIRECT_BASE}?success=youtube_connected`, request.url));
  } catch (err) {
    console.error('[YouTube OAuth] callback error:', err);
    return fail(request, 'youtube_failed');
  }
}
