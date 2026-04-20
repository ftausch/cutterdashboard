import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { calculateDiscrepancy, type VerificationStatus } from '@/lib/verification/discrepancy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT
        v.id, v.platform, v.external_id, v.url, v.title,
        v.account_handle, v.current_views, v.claimed_views,
        v.views_at_last_invoice, v.verification_status, v.verification_source,
        v.discrepancy_status, v.discrepancy_percent,
        v.proof_url, v.proof_status, v.proof_cutter_note,
        v.proof_rejection_reason, v.proof_reviewer_name, v.proof_reviewed_at,
        v.proof_uploaded_at, v.proof_requested_at,
        v.episode_id, v.published_at, v.last_scraped_at, v.created_at,
        v.is_flagged, v.flag_reason,
        e.title as episode_title
      FROM cutter_videos v
      LEFT JOIN episodes e ON v.episode_id = e.id
      WHERE v.id = ? AND v.cutter_id = ?`,
    args: [id, auth.id],
  });

  if (!result.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const r = result.rows[0] as Record<string, unknown>;
  const currentViews   = (r.current_views   as number) ?? 0;
  const lastInvoice    = (r.views_at_last_invoice as number) ?? 0;
  const unbilledViews  = Math.max(0, currentViews - lastInvoice);

  return NextResponse.json({
    video: {
      id:                   r.id,
      platform:             r.platform,
      external_id:          r.external_id,
      url:                  r.url,
      title:                r.title,
      account_handle:       r.account_handle,
      current_views:        currentViews,
      claimed_views:        r.claimed_views,
      views_at_last_invoice: lastInvoice,
      unbilled_views:       unbilledViews,
      verification_status:  r.verification_status,
      verification_source:  r.verification_source,
      discrepancy_status:   r.discrepancy_status,
      discrepancy_percent:  r.discrepancy_percent,
      proof_url:            r.proof_url,
      proof_status:         r.proof_status,
      proof_cutter_note:    r.proof_cutter_note,
      proof_rejection_reason: r.proof_rejection_reason,
      proof_reviewer_name:  r.proof_reviewer_name,
      proof_reviewed_at:    r.proof_reviewed_at,
      proof_uploaded_at:    r.proof_uploaded_at,
      proof_requested_at:   r.proof_requested_at,
      episode_id:           r.episode_id,
      episode_title:        r.episode_title,
      published_at:         r.published_at,
      last_scraped_at:      r.last_scraped_at,
      created_at:           r.created_at,
      is_flagged:           r.is_flagged,
      flag_reason:          r.flag_reason,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const db = await ensureDb();

  // Only allow deleting own videos
  const videoResult = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });

  if (!videoResult.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Don't allow deleting videos that have been invoiced
  const invoicedResult = await db.execute({
    sql: `SELECT id FROM cutter_invoice_items WHERE video_id = ? LIMIT 1`,
    args: [id],
  });

  if (invoicedResult.rows[0]) {
    return NextResponse.json(
      { error: 'Video kann nicht gelöscht werden — bereits in einer Rechnung enthalten' },
      { status: 400 }
    );
  }

  await db.execute({ sql: `DELETE FROM cutter_videos WHERE id = ?`, args: [id] });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const body = await request.json();
  const { claimed_views, episode_id } = body;

  if (claimed_views !== undefined && claimed_views !== null && (typeof claimed_views !== 'number' || claimed_views < 0)) {
    return NextResponse.json({ error: 'Ungültiger Wert für claimed_views' }, { status: 400 });
  }

  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id, platform, current_views, verification_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [id, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; platform: string; current_views: number; verification_status: string;
  } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Handle episode_id update only (no claimed_views change)
  if (episode_id !== undefined && claimed_views === undefined) {
    await db.execute({
      sql: `UPDATE cutter_videos SET episode_id = ? WHERE id = ?`,
      args: [episode_id ?? null, id],
    });
    return NextResponse.json({ success: true });
  }

  // Recalculate discrepancy with new claim
  const verificationStatus = video.verification_status as VerificationStatus;
  const { status: discrepancyStatus, percent: discrepancyPercent } = calculateDiscrepancy(
    video.current_views,
    claimed_views ?? null,
    verificationStatus
  );

  const setClauses = [
    'claimed_views = ?',
    'discrepancy_status = ?',
    'discrepancy_percent = ?',
  ];
  const args: (string | number | null)[] = [
    claimed_views ?? null,
    discrepancyStatus !== 'cannot_verify' ? discrepancyStatus : null,
    discrepancyPercent,
  ];

  if (episode_id !== undefined) {
    setClauses.push('episode_id = ?');
    args.push(episode_id ?? null);
  }

  args.push(id);

  await db.execute({
    sql: `UPDATE cutter_videos SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });

  return NextResponse.json({ success: true, discrepancy_status: discrepancyStatus, discrepancy_percent: discrepancyPercent });
}
