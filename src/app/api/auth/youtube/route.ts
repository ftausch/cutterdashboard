/**
 * GET /api/auth/youtube
 * Initiates YouTube / Google OAuth 2.0 flow.
 * Requires: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET in env.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';

const APP_URL          = process.env.NEXT_PUBLIC_APP_URL || 'https://cutter-dashboard-six.vercel.app';
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || '';

export async function GET(request: NextRequest) {
  if (!YOUTUBE_CLIENT_ID) {
    return NextResponse.redirect(new URL('/accounts?error=youtube_not_configured', request.url));
  }

  const cookieStore  = await cookies();
  const sessionToken = cookieStore.get('cutter_session')?.value;
  const cutter       = await getSessionFromCookie(sessionToken);

  if (!cutter) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Use session token as CSRF state (same pattern as Instagram)
  const params = new URLSearchParams({
    client_id:     YOUTUBE_CLIENT_ID,
    redirect_uri:  `${APP_URL}/api/auth/youtube/callback`,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    access_type:   'offline',   // request refresh_token
    prompt:        'consent',   // force consent screen so refresh_token is always returned
    state:         sessionToken as string,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
