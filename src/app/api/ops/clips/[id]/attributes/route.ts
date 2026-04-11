import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';

const VALID_HOOK_TYPES = [
  'question', 'statement', 'story', 'contrarian', 'how_to', 'list', 'other',
] as const;

const VALID_ANGLES = [
  'educational', 'entertainment', 'opinion', 'case_study', 'behind_scenes', 'other',
] as const;

const VALID_LENGTH_BUCKETS = [
  'under_30s', '30_60s', '60_90s', '90_120s', 'over_120s',
] as const;

const VALID_CTA_TYPES = [
  'subscribe', 'follow', 'link_in_bio', 'comment', 'share', 'podcast_link', 'none', 'other',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const result = await db.execute({
    sql: `SELECT * FROM clip_attributes WHERE video_id = ?`,
    args: [videoId],
  });

  const row = result.rows[0] ?? null;
  return NextResponse.json({ attributes: row });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_READ');
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const body = await request.json();

  // Validate video exists
  const db = await ensureDb();
  const videoCheck = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ?`,
    args: [videoId],
  });
  if (!videoCheck.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  // Extract + validate fields (all optional)
  const guest               = typeof body.guest === 'string'               ? body.guest.trim().slice(0, 200) || null : undefined;
  const topic               = typeof body.topic === 'string'               ? body.topic.trim().slice(0, 200) || null : undefined;
  const hook_type           = typeof body.hook_type === 'string'           ? body.hook_type || null : undefined;
  const content_angle       = typeof body.content_angle === 'string'       ? body.content_angle || null : undefined;
  const clip_length_bucket  = typeof body.clip_length_bucket === 'string'  ? body.clip_length_bucket || null : undefined;
  const cta_type            = typeof body.cta_type === 'string'            ? body.cta_type || null : undefined;

  // Validate enum fields
  if (hook_type !== undefined && hook_type !== null && !VALID_HOOK_TYPES.includes(hook_type as typeof VALID_HOOK_TYPES[number])) {
    return NextResponse.json({ error: `Ungültiger hook_type: ${hook_type}` }, { status: 400 });
  }
  if (content_angle !== undefined && content_angle !== null && !VALID_ANGLES.includes(content_angle as typeof VALID_ANGLES[number])) {
    return NextResponse.json({ error: `Ungültiger content_angle: ${content_angle}` }, { status: 400 });
  }
  if (clip_length_bucket !== undefined && clip_length_bucket !== null && !VALID_LENGTH_BUCKETS.includes(clip_length_bucket as typeof VALID_LENGTH_BUCKETS[number])) {
    return NextResponse.json({ error: `Ungültiger clip_length_bucket: ${clip_length_bucket}` }, { status: 400 });
  }
  if (cta_type !== undefined && cta_type !== null && !VALID_CTA_TYPES.includes(cta_type as typeof VALID_CTA_TYPES[number])) {
    return NextResponse.json({ error: `Ungültiger cta_type: ${cta_type}` }, { status: 400 });
  }

  // Build SET clause dynamically from provided fields
  const updates: Record<string, string | null> = {};
  if (guest !== undefined)              updates.guest = guest;
  if (topic !== undefined)              updates.topic = topic;
  if (hook_type !== undefined)          updates.hook_type = hook_type;
  if (content_angle !== undefined)      updates.content_angle = content_angle;
  if (clip_length_bucket !== undefined) updates.clip_length_bucket = clip_length_bucket;
  if (cta_type !== undefined)           updates.cta_type = cta_type;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Felder angegeben' }, { status: 400 });
  }

  // UPSERT: insert new row or update existing columns
  const setCols = Object.keys(updates);
  const now = new Date().toISOString();

  const insertCols = ['video_id', ...setCols, 'updated_at', 'updated_by_id', 'updated_by_name'];
  const insertPlaceholders = insertCols.map(() => '?').join(', ');
  const insertArgs: (string | null)[] = [
    videoId,
    ...setCols.map(c => updates[c]),
    now,
    auth.id,
    auth.name,
  ];

  const conflictSet = setCols
    .map(c => `${c} = excluded.${c}`)
    .concat(['updated_at = excluded.updated_at', 'updated_by_id = excluded.updated_by_id', 'updated_by_name = excluded.updated_by_name'])
    .join(', ');

  await db.execute({
    sql: `INSERT INTO clip_attributes (${insertCols.join(', ')})
          VALUES (${insertPlaceholders})
          ON CONFLICT(video_id) DO UPDATE SET ${conflictSet}`,
    args: insertArgs,
  });

  const updated = await db.execute({
    sql: `SELECT * FROM clip_attributes WHERE video_id = ?`,
    args: [videoId],
  });

  return NextResponse.json({ attributes: updated.rows[0] ?? null });
}
