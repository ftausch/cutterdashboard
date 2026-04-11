import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';
import { randomUUID } from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT id, author_id, author_name, author_role, body, visibility,
                 original_body, edited_at, created_at
          FROM clip_notes
          WHERE video_id = ? AND is_deleted = 0
          ORDER BY created_at ASC`,
    args: [videoId],
  });

  return NextResponse.json({ notes: result.rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const { body, visibility = 'internal' } = await request.json();

  if (!body?.trim()) {
    return NextResponse.json({ error: 'Notiz darf nicht leer sein' }, { status: 400 });
  }
  if (!['internal', 'cutter_visible'].includes(visibility)) {
    return NextResponse.json({ error: 'Ungültige Sichtbarkeit' }, { status: 400 });
  }

  const db = await ensureDb();

  // Verify video exists
  const check = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ?`,
    args: [videoId],
  });
  if (!check.rows.length) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const noteId = randomUUID();
  await db.execute({
    sql: `INSERT INTO clip_notes
            (id, video_id, author_id, author_name, author_role, body, visibility, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [noteId, videoId, auth.id, auth.name, auth.role, body.trim(), visibility],
  });

  // Only cutter-visible notes are audited — they represent formal communication
  if (visibility === 'cutter_visible') {
    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'note_add',
      entityType: 'video',
      entityId: videoId,
      meta: { note_id: noteId, visibility, preview: body.trim().slice(0, 120) },
    });
  }

  return NextResponse.json({ success: true, noteId });
}
