import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken } from '@/lib/cutter/auth';
import { signSession, makeSessionCookie } from '@/lib/cutter/jwt';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
  }

  const result = await verifyMagicToken(token);

  if (!result) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
  }

  // Issue a JWT — no more DB session table needed
  const jwt = await signSession(result.cutter);

  // Honour redirect param if present and safe (relative paths only)
  const redirectParam = request.nextUrl.searchParams.get('redirect');
  const destination = redirectParam?.startsWith('/') ? redirectParam : '/dashboard';

  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set('Set-Cookie', makeSessionCookie(jwt));
  return response;
}
