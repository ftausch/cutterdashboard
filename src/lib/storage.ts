/**
 * Supabase Storage client — server-side only.
 *
 * Architecture:
 *   - Private bucket "proofs" (no public access).
 *   - Files stored at:  {videoId}/{timestamp}-{safeFilename}.{ext}
 *   - Only signed URLs are ever given to the browser (1-hour TTL).
 *   - The service-role key is used exclusively here; never sent to the client.
 *
 * Required env vars:
 *   SUPABASE_URL              — https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service role JWT (Settings → API)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'proofs';
const SIGNED_URL_TTL = 60 * 60; // 1 hour in seconds

// ── Client singleton ──────────────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = (process.env.SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!url) throw new StorageConfigError('SUPABASE_URL is not set. Add it to your Vercel environment variables.');
  if (!key) throw new StorageConfigError('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your Vercel environment variables.');
  if (!url.startsWith('https://')) throw new StorageConfigError(`SUPABASE_URL looks wrong: "${url}". Expected format: https://<project>.supabase.co`);

  // global.headers.Authorization forces the service-role JWT onto every
  // request (including Storage uploads).  Without this, @supabase/supabase-js
  // v2 may send an anonymous Bearer token from its internal auth session,
  // causing Supabase Storage to apply RLS as the "anon" role and reject the
  // insert into storage.objects with "new row violates row-level security policy".
  _supabase = createClient(url, key, {
    auth: {
      autoRefreshToken:   false,
      persistSession:     false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    },
  });
  return _supabase;
}

// ── Error types ───────────────────────────────────────────────────

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigError';
  }
}

export class StorageUploadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StorageUploadError';
  }
}

// ── Bucket note ───────────────────────────────────────────────────
// The "proofs" bucket is created manually in the Supabase dashboard
// (private, JPEG/PNG/WebP only, 10 MB file-size limit).
// No runtime bucket-creation logic is needed or used here.

// ── Path helpers ──────────────────────────────────────────────────

/**
 * Build a deterministic, URL-safe storage path.
 * Format: {videoId}/{timestamp}-{safeFilename}.{ext}
 */
export function buildStoragePath(videoId: string, originalName: string, mimeType: string): string {
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
  };
  const ext = extMap[mimeType] ?? 'jpg';

  // Sanitise filename: keep only alphanumerics, dots, dashes, underscores
  const base = (originalName || 'proof')
    .replace(/\.[^.]+$/, '')                  // strip extension
    .replace(/[^a-zA-Z0-9._-]/g, '-')         // replace unsafe chars
    .replace(/-+/g, '-')                       // collapse consecutive dashes
    .slice(0, 60)                              // cap length
    || 'proof';

  return `${videoId}/${Date.now()}-${base}.${ext}`;
}

/** Returns true if the value looks like a Supabase storage path (not a full URL). */
export function isStoragePath(value: string): boolean {
  return !value.startsWith('https://') && !value.startsWith('http://');
}

// ── Core operations ───────────────────────────────────────────────

/**
 * Upload a file to Supabase Storage.
 * @returns The storage path (relative to the bucket root), NOT a URL.
 */
export async function uploadProof(
  storagePath: string,
  file: File | Blob | ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const supabase = getClient();

  console.log('[storage.upload] Starting upload:', { storagePath, mimeType, size: file instanceof File ? file.size : '?' });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,            // fail if path already exists — caller must delete first
    });

  if (error) {
    console.error('[storage.upload] Supabase upload failed:', { storagePath, error: error.message });
    throw new StorageUploadError(`Upload to Supabase Storage failed: ${error.message}`, error);
  }

  console.log('[storage.upload] Upload succeeded:', { path: data.path });
  return data.path;
}

/**
 * Delete a file from Supabase Storage.
 * Silently succeeds if the file doesn't exist (idempotent).
 */
export async function deleteProof(storagePath: string): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    // Log but don't throw — deletion failures shouldn't block DB cleanup
    console.warn('[storage.delete] Supabase delete failed (continuing):', { storagePath, error: error.message });
  } else {
    console.log('[storage.delete] Deleted successfully:', storagePath);
  }
}

/**
 * Generate a signed URL for a storage path.
 * Valid for SIGNED_URL_TTL seconds (1 hour by default).
 * The URL can be used directly as an <img src> or download link.
 */
export async function getSignedUrl(storagePath: string, expiresIn = SIGNED_URL_TTL): Promise<string> {
  const supabase = getClient();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    console.error('[storage.signedUrl] Failed:', { storagePath, error: error?.message });
    throw new StorageUploadError(`Could not generate signed URL: ${error?.message ?? 'no data'}`, error);
  }

  return data.signedUrl;
}

/**
 * Resolve a proof URL/path to a viewable URL.
 *
 * Handles backward-compatibility:
 *   - Old Vercel Blob URLs (https://...) → returned as-is
 *   - New Supabase paths (videoId/...) → signed URL generated
 */
export async function resolveProofUrl(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return '';
  // Old Vercel Blob URL — return unchanged
  if (!isStoragePath(pathOrUrl)) return pathOrUrl;
  // New Supabase path — generate signed URL
  return getSignedUrl(pathOrUrl);
}

// ── Config validation ─────────────────────────────────────────────

/** Call this in dev to surface missing config early. */
export function validateStorageConfig(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!process.env.SUPABASE_URL)              errors.push('SUPABASE_URL is not set');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) errors.push('SUPABASE_SERVICE_ROLE_KEY is not set');
  return { ok: errors.length === 0, errors };
}
