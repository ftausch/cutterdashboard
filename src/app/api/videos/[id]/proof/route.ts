import { NextRequest, NextResponse } from 'next/server';
import { requireCutterAuth, isCutter } from '@/lib/cutter/middleware';
import { ensureDb } from '@/lib/db';
import { recalculateReliabilityScore } from '@/lib/reliability';
import { createOpsNotification } from '@/lib/notifications';
import { upsertAlert, resolveAlert } from '@/lib/ops-alerts';
import {
  uploadProof,
  deleteProof,
  getSignedUrl,
  resolveProofUrl,
  buildStoragePath,
  isStoragePath,
  StorageConfigError,
  StorageUploadError,
} from '@/lib/storage';
import { randomUUID } from 'crypto';

type DbClient = Awaited<ReturnType<typeof ensureDb>>;

// Accepted MIME types — images only (PDF removed; Supabase bucket only allows images)
export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',  // non-standard alias — normalised to image/jpeg below
  'image/png',
  'image/webp',
];

// Maximum upload size
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB — Supabase Storage default limit

// ── Schema migrations (idempotent) ───────────────────────────────

async function ensureCutterVideosProofColumns(db: DbClient) {
  const cols = [
    `ALTER TABLE cutter_videos ADD COLUMN proof_url              TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_uploaded_at      TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_status           TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_cutter_note      TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_rejection_reason TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_reviewer_id      TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_reviewer_name    TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_reviewed_at      TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_requested_at     TEXT`,
    `ALTER TABLE cutter_videos ADD COLUMN proof_requested_by     TEXT`,
  ];
  for (const sql of cols) {
    try { await db.execute({ sql, args: [] }); } catch { /* column already exists */ }
  }
}

async function ensureProofFilesTable(db: DbClient) {
  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS cutter_proof_files (
      id               TEXT PRIMARY KEY,
      video_id         TEXT NOT NULL,
      cutter_id        TEXT NOT NULL,
      file_url         TEXT NOT NULL,
      file_name        TEXT,
      file_size        INTEGER,
      mime_type        TEXT,
      display_order    INTEGER NOT NULL DEFAULT 0,
      proof_status     TEXT NOT NULL DEFAULT 'uploaded',
      uploader_note    TEXT,
      reviewed_by_id   TEXT,
      reviewed_by_name TEXT,
      reviewed_at      TEXT,
      review_note      TEXT,
      uploaded_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    args: [],
  });

  const migrations = [
    `ALTER TABLE cutter_proof_files ADD COLUMN proof_status     TEXT NOT NULL DEFAULT 'uploaded'`,
    `ALTER TABLE cutter_proof_files ADD COLUMN uploader_note    TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN reviewed_by_id   TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN reviewed_by_name TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN reviewed_at      TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN review_note      TEXT`,
    `ALTER TABLE cutter_proof_files ADD COLUMN updated_at       TEXT DEFAULT (datetime('now'))`,
  ];
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }); } catch { /* already exists */ }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Map a storage path or legacy Vercel Blob URL to a signed URL.
 * Returns null if the input is empty/null.
 */
async function toViewableUrl(fileUrl: string | null): Promise<string | null> {
  if (!fileUrl) return null;
  try {
    return await resolveProofUrl(fileUrl);
  } catch (e) {
    console.warn('[proof] Could not resolve proof URL:', fileUrl, errMsg(e));
    // Return the raw value as fallback (old Blob URLs still work)
    return fileUrl;
  }
}

// ── GET: return the single active proof for this clip (or null) ──
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  if (!videoResult.rows[0]) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  await ensureProofFilesTable(db);

  const fileResult = await db.execute({
    sql: `SELECT id, file_url, file_name, file_size, mime_type, uploaded_at,
                 proof_status, uploader_note, reviewed_by_name, reviewed_at, review_note
          FROM cutter_proof_files
          WHERE video_id = ? AND cutter_id = ?
          ORDER BY uploaded_at DESC LIMIT 1`,
    args: [videoId, auth.id],
  });

  if (!fileResult.rows[0]) return NextResponse.json({ proof: null });

  const r = fileResult.rows[0] as unknown as Record<string, unknown>;

  // Resolve the stored path/URL to a viewable signed URL
  const viewableUrl = await toViewableUrl(r.file_url as string | null);

  return NextResponse.json({
    proof: {
      id:               r.id              as string,
      file_url:         viewableUrl,                    // signed URL or legacy Blob URL
      file_path:        r.file_url        as string,    // raw stored path (for ops/delete)
      file_name:        r.file_name       as string | null,
      file_size:        r.file_size       as number | null,
      mime_type:        r.mime_type       as string | null,
      uploaded_at:      r.uploaded_at     as string,
      proof_status:     r.proof_status    as string | null,
      uploader_note:    r.uploader_note   as string | null,
      reviewed_by_name: r.reviewed_by_name as string | null,
      reviewed_at:      r.reviewed_at     as string | null,
      review_note:      r.review_note     as string | null,
    },
  });
}

// ── POST: upload the one proof for this clip ─────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;

  // ── 1. DB connection ──────────────────────────────────────────
  let db: DbClient;
  try {
    db = await ensureDb();
  } catch (e) {
    console.error('[proof/upload] DB connection failed:', errMsg(e));
    return NextResponse.json({ error: 'Datenbankverbindung fehlgeschlagen.' }, { status: 503 });
  }

  // ── 2. Video ownership check ───────────────────────────────────
  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; cutter_id: string; proof_status: string | null;
  } | undefined;

  if (!video) {
    return NextResponse.json({ error: 'Video nicht gefunden oder keine Berechtigung.' }, { status: 404 });
  }
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json(
      { error: 'Dieser Nachweis wurde bereits genehmigt und kann nicht ersetzt werden.' },
      { status: 400 }
    );
  }

  // ── 3. One-proof-per-clip enforcement ─────────────────────────
  await ensureProofFilesTable(db);

  const existingResult = await db.execute({
    sql: `SELECT id FROM cutter_proof_files WHERE video_id = ?`,
    args: [videoId],
  });
  if ((existingResult.rows as unknown[]).length > 0) {
    return NextResponse.json(
      { error: 'Für diesen Clip existiert bereits ein Nachweis. Bitte zuerst den vorhandenen Nachweis löschen.' },
      { status: 409 }
    );
  }

  // ── 4. Parse multipart form data ──────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    console.error('[proof/upload] formData() failed:', videoId, errMsg(e));
    return NextResponse.json(
      { error: 'Formulardaten konnten nicht gelesen werden. Bitte erneut versuchen.' },
      { status: 400 }
    );
  }

  const file = formData.get('file') as File | null;
  const note = (formData.get('note') as string | null)?.trim() ?? null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'Keine Datei empfangen.' }, { status: 400 });
  }

  // ── 5. MIME type normalisation & validation ───────────────────
  let fileType = (file.type || '').toLowerCase().trim();
  if (fileType === 'image/jpg') fileType = 'image/jpeg';
  if (!fileType) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) fileType = 'image/jpeg';
    else if (name.endsWith('.png'))  fileType = 'image/png';
    else if (name.endsWith('.webp')) fileType = 'image/webp';
    else fileType = 'image/jpeg'; // last-resort default for camera photos
  }

  if (!fileType.startsWith('image/')) {
    console.warn('[proof/upload] Rejected MIME type:', { videoId, fileType, fileName: file.name });
    return NextResponse.json(
      { error: `Ungültiger Dateityp: "${file.type || 'unbekannt'}". Bitte ein Bild (JPEG, PNG, WebP) hochladen.` },
      { status: 415 }
    );
  }
  // Normalise to only the three types Supabase bucket accepts
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(fileType)) {
    fileType = 'image/jpeg';
  }

  // ── 6. Size validation ────────────────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      { error: `Datei ist zu groß (${mb} MB). Maximal 8 MB erlaubt.` },
      { status: 413 }
    );
  }

  // ── 7. Build Supabase storage path ────────────────────────────
  const fileId      = randomUUID();
  const storagePath = buildStoragePath(videoId, file.name || fileId, fileType);

  console.log('[proof/upload] Starting Supabase upload:', {
    videoId, fileId, storagePath, fileType, fileSize: file.size,
  });

  // ── 8. Upload to Supabase Storage ─────────────────────────────
  let uploadedPath: string;
  try {
    uploadedPath = await uploadProof(storagePath, file, fileType);
    console.log('[proof/upload] Supabase upload succeeded:', { videoId, uploadedPath });
  } catch (e) {
    const detail = errMsg(e);
    if (e instanceof StorageConfigError) {
      console.error('[proof/upload] Storage misconfigured:', detail);
      return NextResponse.json(
        { error: `Speicher-Konfigurationsfehler: ${detail}` },
        { status: 500 }
      );
    }
    console.error('[proof/upload] Supabase upload FAILED:', {
      videoId, storagePath, fileType, fileSize: file.size, error: detail,
    });
    return NextResponse.json(
      { error: `Upload fehlgeschlagen: ${detail}` },
      { status: 500 }
    );
  }

  // ── 9. Persist proof record ───────────────────────────────────
  // We store the Supabase storage PATH (not a URL) in file_url.
  // Signed URLs are generated on-demand when the proof is retrieved.
  await ensureCutterVideosProofColumns(db);

  try {
    await db.execute({
      sql: `INSERT INTO cutter_proof_files
              (id, video_id, cutter_id, file_url, file_name, file_size, mime_type,
               display_order, proof_status, uploader_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'uploaded', ?)`,
      args: [fileId, videoId, auth.id, uploadedPath, file.name || null, file.size, fileType, note],
    });

    await db.execute({
      sql: `UPDATE cutter_videos
            SET proof_url              = ?,
                proof_uploaded_at      = datetime('now'),
                proof_status           = 'proof_submitted',
                proof_cutter_note      = COALESCE(?, proof_cutter_note),
                proof_rejection_reason = NULL,
                proof_reviewer_id      = NULL,
                proof_reviewer_name    = NULL,
                proof_reviewed_at      = NULL
            WHERE id = ?`,
      args: [uploadedPath, note, videoId],
    });
  } catch (e) {
    console.error('[proof/upload] DB persist failed — storage file uploaded but record not saved:', {
      videoId, fileId, uploadedPath, error: errMsg(e),
    });
    // Best-effort cleanup of the orphaned storage object
    await deleteProof(uploadedPath);
    return NextResponse.json(
      { error: 'Datenbankfehler beim Speichern des Nachweises. Bitte erneut versuchen.' },
      { status: 500 }
    );
  }

  // ── 10. Generate a signed URL for the immediate response ──────
  let signedUrl: string = uploadedPath;
  try {
    signedUrl = await getSignedUrl(uploadedPath);
  } catch (e) {
    console.warn('[proof/upload] Could not generate signed URL for response (non-fatal):', errMsg(e));
  }

  // ── 11. Non-critical side effects ─────────────────────────────
  try { await recalculateReliabilityScore(db, auth.id); } catch (e) {
    console.warn('[proof/upload] recalculateReliabilityScore failed (non-fatal):', errMsg(e));
  }

  try {
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
    await upsertAlert(db, { type: 'proof_submitted', videoId, cutterId: auth.id, cutterName: auth.name });
    await resolveAlert(db, 'proof_overdue', videoId);
  } catch (e) {
    console.warn('[proof/upload] Notification/alert failed (non-fatal):', errMsg(e));
  }

  return NextResponse.json({
    success:    true,
    proof_url:  signedUrl,   // viewable URL for immediate use in the UI
    file_path:  uploadedPath, // storage path (for future reference)
    file_id:    fileId,
  });
}

// ── DELETE: remove the proof for this clip ───────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireCutterAuth(request);
  if (!isCutter(auth)) return auth;

  const { id: videoId } = await params;
  const db = await ensureDb();

  const videoResult = await db.execute({
    sql: `SELECT id, cutter_id, proof_url, proof_status FROM cutter_videos WHERE id = ? AND cutter_id = ?`,
    args: [videoId, auth.id],
  });
  const video = videoResult.rows[0] as unknown as {
    id: string; cutter_id: string; proof_url: string | null; proof_status: string | null;
  } | undefined;

  if (!video) return NextResponse.json({ error: 'Video nicht gefunden.' }, { status: 404 });
  if (video.proof_status === 'proof_approved') {
    return NextResponse.json({ error: 'Genehmigter Nachweis kann nicht entfernt werden.' }, { status: 400 });
  }

  await ensureProofFilesTable(db);

  const fileResult = await db.execute({
    sql: `SELECT id, file_url FROM cutter_proof_files WHERE video_id = ? AND cutter_id = ? LIMIT 1`,
    args: [videoId, auth.id],
  });
  const fileRow = fileResult.rows[0] as unknown as { id: string; file_url: string } | undefined;

  if (fileRow) {
    // Delete from Supabase Storage (or skip gracefully for legacy Blob URLs)
    if (isStoragePath(fileRow.file_url)) {
      await deleteProof(fileRow.file_url); // non-throwing
    } else {
      // Legacy Vercel Blob URL — we no longer have a token to delete it,
      // but the DB record still gets cleaned up so the slot is freed.
      console.log('[proof/delete] Skipping legacy Blob URL deletion (no token):', fileRow.file_url);
    }

    await db.execute({
      sql: `DELETE FROM cutter_proof_files WHERE id = ?`,
      args: [fileRow.id],
    });
  }

  await db.execute({
    sql: `UPDATE cutter_videos
          SET proof_url              = NULL,
              proof_uploaded_at      = NULL,
              proof_status           = 'no_proof_needed',
              proof_cutter_note      = NULL,
              proof_rejection_reason = NULL
          WHERE id = ?`,
    args: [videoId],
  });

  return NextResponse.json({ success: true });
}
