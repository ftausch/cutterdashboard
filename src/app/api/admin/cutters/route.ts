import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import type { Role } from '@/lib/permissions';

const VALID_ROLES: Role[] = ['super_admin', 'ops_manager', 'cutter', 'viewer'];

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();
  const result = await db.execute(
    `SELECT c.*,
      (SELECT COUNT(*) FROM cutter_videos WHERE cutter_id = c.id) as video_count,
      (SELECT COALESCE(SUM(total_amount), 0) FROM cutter_invoices WHERE cutter_id = c.id) as total_invoiced,
      (SELECT COALESCE(SUM(current_views), 0) FROM cutter_videos WHERE cutter_id = c.id) as total_views
     FROM cutters c ORDER BY c.created_at DESC`
  );

  return NextResponse.json({ cutters: result.rows });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const { name, email, rate_per_view } = await request.json();

  if (!name || !email) {
    return NextResponse.json({ error: 'Name und E-Mail erforderlich' }, { status: 400 });
  }

  const db = await ensureDb();

  // Check duplicate email
  const existingResult = await db.execute({
    sql: `SELECT id FROM cutters WHERE email = ?`,
    args: [email.trim().toLowerCase()],
  });
  if (existingResult.rows[0]) {
    return NextResponse.json({ error: 'E-Mail bereits registriert' }, { status: 409 });
  }

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO cutters (id, name, email, rate_per_view) VALUES (?, ?, ?, ?)`,
    args: [id, name.trim(), email.trim().toLowerCase(), rate_per_view || 0.01],
  });

  return NextResponse.json({ id, name, email: email.trim().toLowerCase() });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'USER_MANAGE');
  if (!isCutter(auth)) return auth;

  const { id, ...updates } = await request.json();
  if (!id) {
    return NextResponse.json({ error: 'ID erforderlich' }, { status: 400 });
  }

  const db = await ensureDb();

  // Validate role if provided
  if ('role' in updates && !VALID_ROLES.includes(updates.role as Role)) {
    return NextResponse.json({ error: `Ungültige Rolle: ${updates.role}` }, { status: 400 });
  }

  const allowedFields = ['name', 'email', 'rate_per_view', 'is_active', 'role'];
  const sets: string[] = [];
  const values: (string | number)[] = [];

  for (const field of allowedFields) {
    if (field in updates) {
      sets.push(`${field} = ?`);
      values.push(updates[field]);
    }
  }

  // Keep is_admin in sync with role for backward compatibility
  if ('role' in updates) {
    sets.push('is_admin = ?');
    values.push(updates.role === 'super_admin' ? 1 : 0);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen' }, { status: 400 });
  }

  values.push(id);
  await db.execute({
    sql: `UPDATE cutters SET ${sets.join(', ')} WHERE id = ?`,
    args: values,
  });

  // Audit log for activation changes
  if ('is_active' in updates) {
    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: updates.is_active ? 'cutter_reactivate' : 'cutter_deactivate',
      entityType: 'cutter',
      entityId: id,
    });
  }

  // Audit log for new cutter creation via POST fallback
  return NextResponse.json({ success: true });
}
