import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { ensureDb } from '@/lib/db';
import { signSession, makeSessionCookie } from '@/lib/cutter/jwt';
import type { CutterRow } from '@/lib/cutter/auth';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'E-Mail und Passwort erforderlich' }, { status: 400 });
  }

  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT * FROM cutters WHERE email = ? AND is_active = 1 AND password_hash IS NOT NULL`,
    args: [email.trim().toLowerCase()],
  });

  const cutter = result.rows[0] as unknown as (CutterRow & { password_hash: string }) | undefined;
  if (!cutter) {
    return NextResponse.json({ error: 'Ungültige Anmeldedaten' }, { status: 401 });
  }

  const hash = createHash('sha256').update(password).digest('hex');
  if (hash !== cutter.password_hash) {
    return NextResponse.json({ error: 'Ungültige Anmeldedaten' }, { status: 401 });
  }

  const jwt = await signSession(cutter);
  const response = NextResponse.json({ success: true });
  response.headers.set('Set-Cookie', makeSessionCookie(jwt));
  return response;
}
