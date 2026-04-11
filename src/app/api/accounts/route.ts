import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

const VALID_PLATFORMS = ['tiktok', 'youtube', 'instagram', 'facebook'] as const;

/** Compute whether the access token is still valid (or we have no expiry info). */
function isTokenExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

/**
 * GET /api/accounts
 * Returns connected accounts with live connection_status derived from token state.
 * Also includes whether OAuth is configured for each platform (from env).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const db     = await ensureDb();
  const result = await db.execute({
    sql: `SELECT
            id, platform, account_handle, account_url,
            youtube_channel_id, instagram_user_id, platform_user_id,
            connection_status, connection_type,
            views_accessible, verification_confidence,
            oauth_access_token, oauth_token_expires_at, oauth_scopes,
            capability_flags, sync_error,
            created_at, updated_at, last_synced_at
          FROM cutter_accounts
          WHERE cutter_id = ?
          ORDER BY platform`,
    args: [auth.id],
  });

  // Derive live connection_status based on token expiry
  const accounts = result.rows.map((row) => {
    const status     = row.connection_status as string ?? 'manual';
    const expiresAt  = row.oauth_token_expires_at as string | null;
    const hasToken   = !!(row.oauth_access_token as string);

    let liveStatus = status;
    if (hasToken && isTokenExpired(expiresAt) && status === 'connected') {
      liveStatus = 'token_expired';
    }

    // Don't expose raw tokens to the client
    return {
      id:                     row.id,
      platform:               row.platform,
      account_handle:         row.account_handle,
      account_url:            row.account_url,
      youtube_channel_id:     row.youtube_channel_id,
      platform_user_id:       row.platform_user_id ?? row.instagram_user_id,
      connection_status:      liveStatus,
      connection_type:        row.connection_type ?? 'manual',
      views_accessible:       !!row.views_accessible,
      verification_confidence:row.verification_confidence ?? 'none',
      oauth_scopes:           row.oauth_scopes,
      capability_flags:       row.capability_flags,
      sync_error:             row.sync_error,
      token_expires_at:       expiresAt,
      has_token:              hasToken,
      created_at:             row.created_at,
      updated_at:             row.updated_at,
      last_synced_at:         row.last_synced_at,
    };
  });

  // Tell the frontend which platforms have OAuth configured
  const oauthConfigured = {
    youtube:   !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    instagram: !!(process.env.INSTAGRAM_APP_ID  && process.env.INSTAGRAM_APP_SECRET),
    facebook:  !!(process.env.FACEBOOK_APP_ID   && process.env.FACEBOOK_APP_SECRET),
    tiktok:    !!(process.env.TIKTOK_CLIENT_KEY  && process.env.TIKTOK_CLIENT_SECRET),
  };

  return NextResponse.json({ accounts, oauth_configured: oauthConfigured });
}

/**
 * POST /api/accounts
 * Registers a manual account connection (handle-only, no OAuth).
 */
export async function POST(request: NextRequest) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { platform, account_handle, account_url } = await request.json();

  if (!platform || !VALID_PLATFORMS.includes(platform as typeof VALID_PLATFORMS[number])) {
    return NextResponse.json(
      { error: 'Ungültige Plattform. Erlaubt: ' + VALID_PLATFORMS.join(', ') },
      { status: 400 }
    );
  }
  if (!account_handle || typeof account_handle !== 'string') {
    return NextResponse.json({ error: 'Account-Handle erforderlich' }, { status: 400 });
  }

  const db = await ensureDb();

  const existing = await db.execute({
    sql: `SELECT id FROM cutter_accounts WHERE cutter_id = ? AND platform = ?`,
    args: [auth.id, platform],
  });
  if (existing.rows[0]) {
    return NextResponse.json(
      { error: `Du hast bereits ein ${platform}-Konto verknüpft. Lösche es zuerst.` },
      { status: 409 }
    );
  }

  const id     = randomUUID();
  const handle = account_handle.trim().replace(/^@/, '').toLowerCase();

  await db.execute({
    sql: `INSERT INTO cutter_accounts
            (id, cutter_id, platform, account_handle, account_url,
             connection_status, connection_type, views_accessible, verification_confidence)
          VALUES (?, ?, ?, ?, ?, 'manual', 'manual', 0, 'none')`,
    args: [id, auth.id, platform, handle, account_url || null],
  });

  return NextResponse.json({ id, platform, account_handle: handle, connection_status: 'manual' });
}
