import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';
import { createOpsNotification } from '@/lib/notifications';
import { upsertAlert, resolveAlert } from '@/lib/ops-alerts';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  // Verify video belongs to auth user
  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });

  const video = videoResult.rows[0] as unknown as { id: string; cutter_id: string; proof_status: string | null } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Don't allow re-upload if already approved
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Beleg wurde bereits genehmigt' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const note = (formData.get('note') as string | null)?.trim() ?? null;

  if (!file) {
    return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
  }

  // Validate type and size
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Nur JPEG, PNG oder WebP erlaubt' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'Datei darf maximal 10 MB groß sein' }, { status: 400 });
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extMap[file.type];

  const blob = await put(`proofs/${videoId}/${Date.now()}.${ext}`, file, { access: 'public' });

  await db.execute({
    sql: `UPDATE cutter_videos
          SET proof_url = ?,
              proof_uploaded_at = datetime('now'),
              proof_status = 'proof_submitted',
              proof_cutter_note = ?,
              proof_rejection_reason = NULL,
              proof_reviewer_id = NULL,
              proof_reviewer_name = NULL,
              proof_reviewed_at = NULL
          WHERE id = ?`,
    args: [blob.url, note, videoId],
  });

  await recalculateReliabilityScore(db, auth.id);

  // Notify ops that a proof needs review
  const videoMeta = await db.execute({ sql: `SELECT title FROM cutter_videos WHERE id = ?`, args: [videoId] });
  const videoTitle = (videoMeta.rows[0] as Record<string, unknown>)?.title as string | null ?? null;
  await createOpsNotification(db, {
    type: 'proof_submitted',
    title: 'Neuer Beleg eingereicht',
    body: `${auth.name} hat einen Screenshot für "${videoTitle ?? 'Clip'}" hochgeladen.`,
    actionUrl: '/ops/verification',
    entityType: 'video',
    entityId: videoId,
    dedupWindowHours: 12,
  });

  // Alert: proof now waiting for review; clear any overdue alert
  await upsertAlert(db, {
    type: 'proof_submitted',
    videoId,
    cutterId: auth.id,
    cutterName: auth.name,
  });
  await resolveAlert(db, 'proof_overdue', videoId);

  return NextResponse.json({ proof_url: blob.url });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  // Verify video belongs to auth user
  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_url, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });

  const video = videoResult.rows[0] as unknown as {
    id: string;
    cutter_id: string;
    proof_url: string | null;
    proof_status: string | null;
  } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Don't allow delete if approved or under review
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Genehmigter Beleg kann nicht entfernt werden' }, { status: 400 });
  }

  if (video.proof_url) {
    try {
      await del(video.proof_url);
    } catch {
      // Ignore blob deletion errors
    }
  }

  await db.execute({
    sql: `UPDATE cutter_videos
          SET proof_url = NULL,
              proof_uploaded_at = NULL,
              proof_status = 'no_proof_needed',
              proof_cutter_note = NULL,
              proof_rejection_reason = NULL
          WHERE id = ?`,
    args: [videoId],
  });

  return NextResponse.json({ success: true });
}
