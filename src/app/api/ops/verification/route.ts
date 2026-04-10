import { NextRequest, NextResponse } from 'next/server';
import { requireOpsAccess, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';
import { writeAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { resolveAlert, upsertAlert } from '@/lib/ops-alerts';

export async function GET(request: NextRequest) {
  const auth = await requireOpsAccess(request);
  if (!isCutter(auth)) return auth;

  const db = await ensureDb();

  const result = await db.execute(`
    SELECT
      v.id, v.title, v.url, v.platform,
      v.proof_url, v.proof_uploaded_at, v.proof_status,
      v.proof_cutter_note, v.proof_rejection_reason,
      v.claimed_views, v.current_views, v.observed_views, v.api_views,
      v.verification_source, v.confidence_level,
      v.discrepancy_status, v.discrepancy_percent,
      c.name as cutter_name, c.id as cutter_id
    FROM cutter_videos v
    JOIN cutters c ON c.id = v.cutter_id
    WHERE v.proof_status = 'proof_submitted'
    ORDER BY v.proof_uploaded_at DESC
  `);

  return NextResponse.json({ proofs: result.rows });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOpsAccess(request);
  if (!isCutter(auth)) return auth;

  const { videoId, action, notes, rejectionReason } = await request.json();

  if (!videoId || !['approve', 'reject', 'request_proof'].includes(action)) {
    return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  }

  const db = await ensureDb();

  // Get video + cutter info in one query
  const videoResult = await db.execute({
    sql: `SELECT v.id, v.cutter_id, v.title, c.name AS cutter_name
          FROM cutter_videos v JOIN cutters c ON c.id = v.cutter_id
          WHERE v.id = ?`,
    args: [videoId],
  });

  const videoRow = videoResult.rows[0] as Record<string, unknown> | undefined;
  if (!videoRow) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }
  const video = {
    id: videoRow.id as string,
    cutter_id: videoRow.cutter_id as string,
    cutter_name: (videoRow.cutter_name as string) ?? 'Unbekannt',
  };
  const videoTitle = (videoRow.title as string | null) ?? null;

  const now = new Date().toISOString();

  if (action === 'approve') {
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_status = 'proof_approved',
                proof_reviewer_id = ?,
                proof_reviewer_name = ?,
                proof_reviewed_at = ?,
                review_notes = ?,
                verification_status = 'manual_proof'
            WHERE id = ?`,
      args: [auth.id, auth.name, now, notes ?? null, videoId],
    });

    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'proof_approve',
      entityType: 'video',
      entityId: videoId,
      meta: { cutter_id: video.cutter_id, notes: notes ?? null },
    });

    await createNotification(db, {
      recipientId: video.cutter_id,
      type: 'proof_approved',
      title: 'Beleg genehmigt ✓',
      body: `Dein Beleg für "${videoTitle ?? 'Clip'}" wurde genehmigt. Der Clip gilt als verifiziert.`,
      actionUrl: '/videos',
      entityType: 'video',
      entityId: videoId,
      dedupWindowHours: 48,
    });
    // Proof approved → clear proof alert + discrepancy alerts (proof overrides them)
    await resolveAlert(db, 'proof_submitted', videoId, auth.id, auth.name);
    await resolveAlert(db, 'proof_overdue',   videoId, auth.id, auth.name);
    await resolveAlert(db, 'discrepancy_critical',   videoId, auth.id, auth.name);
    await resolveAlert(db, 'discrepancy_suspicious', videoId, auth.id, auth.name);

  } else if (action === 'reject') {
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_status = 'proof_rejected',
                proof_reviewer_id = ?,
                proof_reviewer_name = ?,
                proof_reviewed_at = ?,
                proof_rejection_reason = ?,
                review_notes = ?
            WHERE id = ?`,
      args: [auth.id, auth.name, now, rejectionReason ?? null, notes ?? null, videoId],
    });

    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'proof_reject',
      entityType: 'video',
      entityId: videoId,
      meta: { cutter_id: video.cutter_id, reason: rejectionReason ?? null, notes: notes ?? null },
    });

    await createNotification(db, {
      recipientId: video.cutter_id,
      type: 'proof_rejected',
      title: 'Beleg abgelehnt',
      body: rejectionReason
        ? `Dein Beleg für "${videoTitle ?? 'Clip'}" wurde abgelehnt: ${rejectionReason}. Bitte lade einen neuen Screenshot hoch.`
        : `Dein Beleg für "${videoTitle ?? 'Clip'}" wurde abgelehnt. Bitte lade einen neuen Screenshot hoch.`,
      actionUrl: '/videos',
      entityType: 'video',
      entityId: videoId,
      dedupWindowHours: 12,
    });
    // Proof rejected → clear submitted alert, open overdue (new proof needed)
    await resolveAlert(db, 'proof_submitted', videoId, auth.id, auth.name);
    await upsertAlert(db, {
      type: 'proof_overdue',
      videoId,
      cutterId: video.cutter_id,
      cutterName: video.cutter_name,
      meta: { hours_overdue: 0, reason: rejectionReason ?? null },
    });

  } else if (action === 'request_proof') {
    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_status = 'proof_requested',
                proof_requested_by = ?,
                proof_requested_at = ?,
                review_notes = ?
            WHERE id = ?`,
      args: [auth.name, now, notes ?? null, videoId],
    });

    await writeAuditLog(db, {
      actorId: auth.id,
      actorName: auth.name,
      action: 'proof_request',
      entityType: 'video',
      entityId: videoId,
      meta: { cutter_id: video.cutter_id, notes: notes ?? null },
    });

    await createNotification(db, {
      recipientId: video.cutter_id,
      type: 'proof_required',
      title: 'Beleg angefordert',
      body: notes
        ? `Für "${videoTitle ?? 'Clip'}" wird ein Screenshot benötigt: ${notes}`
        : `Für "${videoTitle ?? 'Clip'}" wird ein Screenshot der View-Anzahl benötigt.`,
      actionUrl: '/videos',
      entityType: 'video',
      entityId: videoId,
      dedupWindowHours: 24,
    });
  }

  const newScore = await recalculateReliabilityScore(db, video.cutter_id);

  return NextResponse.json({ success: true, newScore });
}
