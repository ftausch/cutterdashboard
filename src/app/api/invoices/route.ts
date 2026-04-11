import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'INVOICE_READ');
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT * FROM cutter_invoices WHERE cutter_id = ? ORDER BY created_at DESC`,
    args: [auth.id],
  });

  return NextResponse.json({ invoices: result.rows });
}
