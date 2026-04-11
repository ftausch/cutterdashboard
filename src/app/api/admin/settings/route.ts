import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const result = await db.execute(`SELECT key, value FROM cutter_settings`);
  const rows = result.rows as unknown as Array<{ key: string; value: string }>;

  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const { key, value } = await request.json();

  if (!key || typeof key !== 'string') {
    return NextResponse.json({ error: 'Key erforderlich' }, { status: 400 });
  }

  const db = await ensureDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO cutter_settings (key, value) VALUES (?, ?)`,
    args: [key, String(value ?? '')],
  });

  return NextResponse.json({ success: true });
}
