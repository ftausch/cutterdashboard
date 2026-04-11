import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { can, type Role } from '@/lib/permissions';
import { ensureDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requirePermission(request, 'NOTE_CREATE');
  if (!isCutter(auth)) return auth;

  const { id: videoId, noteId } = await params;
  const { body } = await request.json();

  if (!body?.trim()) {
    return NextResponse.json({ error: 'Notiz darf nicht leer sein' }, { status: 400 });
  }

  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT id, author_id, body, original_body, visibility
          FROM clip_notes
          WHERE id = ? AND video_id = ? AND is_deleted = 0`,
    args: [noteId, videoId],
  });

  const note = result.rows[0] as Record<string, unknown> | undefined;
  if (!note) {
    return NextResponse.json({ error: 'Notiz nicht gefunden' }, { status: 404 });
  }

  // Only author or admin can edit
  if (note.author_id !== auth.id && !can(auth.role as Role, 'NOTE_DELETE_ANY')) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  // Preserve original body on first edit only
  const originalBody = (note.original_body as string | null) ?? (note.body as string);

  await db.execute({
    sql: `UPDATE clip_notes
          SET body = ?, original_body = ?, edited_at = datetime('now')
          WHERE id = ?`,
    args: [body.trim(), originalBody, noteId],
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const auth = await requirePermission(request, 'NOTE_CREATE');
  if (!isCutter(auth)) return auth;

  const { id: videoId, noteId } = await params;
  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT id, author_id, visibility
          FROM clip_notes
          WHERE id = ? AND video_id = ? AND is_deleted = 0`,
    args: [noteId, videoId],
  });

  const note = result.rows[0] as Record<string, unknown> | undefined;
  if (!note) {
    return NextResponse.json({ error: 'Notiz nicht gefunden' }, { status: 404 });
  }

  // Only author or admin can delete
  if (note.author_id !== auth.id && !can(auth.role as Role, 'NOTE_DELETE_ANY')) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  // Soft-delete — preserves audit trail and history
  await db.execute({
    sql: `UPDATE clip_notes SET is_deleted = 1 WHERE id = ?`,
    args: [noteId],
  });

  // Always audit deletions so there is a record that content was removed
  await writeAuditLog(db, {
    actorId: auth.id,
    actorName: auth.name,
    action: 'note_delete',
    entityType: 'video',
    entityId: videoId,
    meta: { note_id: noteId, visibility: note.visibility as string },
  });

  return NextResponse.json({ success: true });
}
