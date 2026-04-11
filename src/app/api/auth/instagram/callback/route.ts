import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { getSessionFromCookie } from '@/lib/cutter/auth';
import { ensureDb } from '@/lib/db';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cutter-dashboard-six.vercel.app';
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || '';
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // User denied access
  if (error) {
    return NextResponse.redirect(new URL('/accounts?error=instagram_denied', request.url));
  }

  // Validate state against session cookie
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('cutter_session')?.value;

  if (!state || state !== sessionToken) {
    return NextResponse.redirect(new URL('/accounts?error=invalid_state', request.url));
  }

  // Get the authenticated cutter from the state (which is the session token)
  const cutter = await getSessionFromCookie(state);
  if (!cutter) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/accounts?error=instagram_failed', request.url));
  }

  try {
    // Step 1: Exchange code for short-lived token
    const tokenBody = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: `${APP_URL}/api/auth/instagram/callback`,
      code,
    });

    const shortTokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!shortTokenRes.ok) {
      console.error('Instagram short token error:', await shortTokenRes.text());
      return NextResponse.redirect(new URL('/accounts?error=instagram_failed', request.url));
    }

    const shortTokenData = await shortTokenRes.json();
    const shortToken: string = shortTokenData.access_token;

    // Step 2: Exchange short-lived for long-lived token (60 days)
    const longTokenParams = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      access_token: shortToken,
    });

    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token?${longTokenParams.toString()}`
    );

    if (!longTokenRes.ok) {
      console.error('Instagram long token error:', await longTokenRes.text());
      return NextResponse.redirect(new URL('/accounts?error=instagram_failed', request.url));
    }

    const longTokenData = await longTokenRes.json();
    const longToken: string = longTokenData.access_token;
    const expiresAt = new Date(
      Date.now() + (longTokenData.expires_in || 5183944) * 1000
    ).toISOString();

    // Step 3: Get Instagram user ID and username
    const meParams = new URLSearchParams({
      fields: 'id,username',
      access_token: longToken,
    });

    const meRes = await fetch(`https://graph.instagram.com/me?${meParams.toString()}`);

    if (!meRes.ok) {
      console.error('Instagram /me error:', await meRes.text());
      return NextResponse.redirect(new URL('/accounts?error=instagram_failed', request.url));
    }

    const meData = await meRes.json();
    const instagramUserId: string = meData.id;
    const instagramUsername: string = meData.username;

    // Step 4: Upsert into cutter_accounts
    const db = await ensureDb();

    const existing = await db.execute({
      sql: `SELECT id FROM cutter_accounts WHERE cutter_id = ? AND platform = 'instagram'`,
      args: [cutter.id],
    });

    const capabilityFlags = JSON.stringify({
      official_api:         true,
      views_available:      true,
      video_list_available: true,
      clip_level_metrics:   true,
      note:                 'Requires Business or Creator account for video insights',
    });

    if (existing.rows[0]) {
      // UPDATE existing row
      await db.execute({
        sql: `UPDATE cutter_accounts
              SET oauth_access_token      = ?,
                  oauth_token_expires_at  = ?,
                  instagram_user_id       = ?,
                  platform_user_id        = ?,
                  account_handle          = ?,
                  connection_status       = 'connected',
                  connection_type         = 'oauth',
                  views_accessible        = 1,
                  verification_confidence = 'medium',
                  capability_flags        = ?,
                  sync_error              = NULL,
                  updated_at              = datetime('now')
              WHERE cutter_id = ? AND platform = 'instagram'`,
        args: [longToken, expiresAt, instagramUserId, instagramUserId, instagramUsername, capabilityFlags, cutter.id],
      });
    } else {
      // INSERT new row
      await db.execute({
        sql: `INSERT INTO cutter_accounts
                (id, cutter_id, platform, account_handle,
                 oauth_access_token, oauth_token_expires_at,
                 instagram_user_id, platform_user_id,
                 connection_status, connection_type,
                 views_accessible, verification_confidence, capability_flags)
              VALUES (?, ?, 'instagram', ?, ?, ?, ?, ?, 'connected', 'oauth', 1, 'medium', ?)`,
        args: [
          randomUUID(), cutter.id,
          instagramUsername, longToken, expiresAt,
          instagramUserId, instagramUserId,
          capabilityFlags,
        ],
      });
    }

    return NextResponse.redirect(new URL('/accounts?success=instagram_connected', request.url));
  } catch (err) {
    console.error('Instagram OAuth callback error:', err);
    return NextResponse.redirect(new URL('/accounts?error=instagram_failed', request.url));
  }
}
