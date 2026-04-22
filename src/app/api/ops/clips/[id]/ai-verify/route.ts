/**
 * POST /api/ops/clips/[id]/ai-verify
 *
 * Sends the cutter's proof screenshot to Claude Vision, extracts the view
 * count shown in the image, and compares it to claimed_views.
 *
 * If the numbers match within ±5 %, the clip is automatically approved and
 * set to verification_status = 'verified'.
 *
 * Requires env var: ANTHROPIC_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { resolveProofUrl } from '@/lib/storage';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';

// ── Turso helper ──────────────────────────────────────────────────────────
async function dbQuery(sql: string, args: unknown[] = []) {
  const url   = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res   = await fetch(`${url}/v2/pipeline`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          type: 'execute',
          stmt: {
            sql,
            args: args.map(a =>
              a === null
                ? { type: 'null' }
                : typeof a === 'number'
                ? { type: 'integer', value: String(Math.round(a)) }
                : { type: 'text', value: String(a) }
            ),
          },
        },
        { type: 'close' },
      ],
    }),
  });
  const data   = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result ?? { rows: [], cols: [] };
}

function val(cell: unknown): string | null {
  if (cell == null) return null;
  const c = cell as { value: string | null };
  return c.value ?? null;
}
function intVal(cell: unknown): number | null {
  const v = val(cell);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

// ── Supported image media types for Claude ────────────────────────────────
const MIME_MAP: Record<string, 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg':  'image/jpeg',
  'image/png':  'image/png',
  'image/webp': 'image/webp',
  'image/gif':  'image/gif',
};

// ── Platform-specific hints for the prompt ────────────────────────────────
const PLATFORM_HINT: Record<string, string> = {
  youtube:   'YouTube (shows "X Aufrufe" or "X views")',
  tiktok:    'TikTok (may abbreviate as "3.3K" or "1.2M")',
  instagram: 'Instagram (shows "X Aufrufe" or "X views" under a Reel or post)',
  facebook:  'Facebook (shows "X Aufrufe" or "X views")',
};

// ── Main handler ──────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY ist nicht konfiguriert.' },
      { status: 500 }
    );
  }

  const { id } = await params;

  // ── 1. Fetch clip + proof file from DB ──────────────────────────────────
  const [clipResult, proofResult] = await Promise.all([
    dbQuery(
      `SELECT claimed_views, platform, proof_url FROM cutter_videos WHERE id = ?`,
      [id]
    ),
    dbQuery(
      `CREATE TABLE IF NOT EXISTS cutter_proof_files (
        id TEXT PRIMARY KEY, video_id TEXT NOT NULL, cutter_id TEXT NOT NULL,
        file_url TEXT NOT NULL, file_name TEXT, file_size INTEGER, mime_type TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ).then(() =>
      dbQuery(
        `SELECT file_url, mime_type FROM cutter_proof_files
         WHERE video_id = ? ORDER BY uploaded_at DESC LIMIT 1`,
        [id]
      )
    ),
  ]);

  if (!clipResult.rows.length) {
    return NextResponse.json({ error: 'Clip nicht gefunden' }, { status: 404 });
  }

  const clipRow      = clipResult.rows[0] as unknown[];
  const claimedViews = intVal(clipRow[0]);
  const platform     = val(clipRow[1]) ?? '';
  const legacyUrl    = val(clipRow[2]);

  const pfRow    = proofResult.rows[0] as unknown[] | undefined;
  const rawPath  = (pfRow ? val(pfRow[0]) : null) ?? legacyUrl;
  const mimeHint = pfRow ? val(pfRow[1]) : null;

  if (!rawPath) {
    return NextResponse.json(
      { error: 'Kein Beleg-Screenshot hochgeladen.' },
      { status: 400 }
    );
  }
  if (claimedViews == null) {
    return NextResponse.json(
      { error: 'Keine angegebenen Views vorhanden.' },
      { status: 400 }
    );
  }

  // ── 2. Download image from Supabase Storage ─────────────────────────────
  let imageBase64: string;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  try {
    const signedUrl = await resolveProofUrl(rawPath);
    const imgRes    = await fetch(signedUrl);
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') ?? mimeHint ?? 'image/jpeg';
    mediaType = MIME_MAP[contentType.split(';')[0].trim()] ?? 'image/jpeg';

    const buffer  = await imgRes.arrayBuffer();
    imageBase64   = Buffer.from(buffer).toString('base64');
  } catch (err) {
    console.error('[ai-verify] Image download failed:', err);
    return NextResponse.json(
      { error: 'Screenshot konnte nicht geladen werden.' },
      { status: 502 }
    );
  }

  // ── 3. Ask Claude to extract the view count ─────────────────────────────
  const anthropic   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const platformHint = PLATFORM_HINT[platform] ?? 'a video platform';

  let extracted: { views: number | null; confidence: 'high' | 'medium' | 'low'; raw_text: string };

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `This screenshot is from ${platformHint}.

Find the TOTAL VIEW COUNT (Aufrufe / Views / Wiedergaben / plays) for the video and return it as an exact integer.

Rules for abbreviations in the screenshot:
- "3,3K" or "3.3K" → 3300
- "1,2M" or "1.2M" → 1200000
- German decimal: "3.258" → 3258 (period is thousands separator)
- Ignore likes, comments, shares — only views/Aufrufe

Respond with ONLY valid JSON, no other text:
{"views": <integer or null if not found>, "confidence": "high" | "medium" | "low", "raw_text": "<exact text you see for the view count>"}`,
          },
        ],
      }],
    });

    const textBlock = msg.content.find(c => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') throw new Error('No text in response');

    // Strip markdown code fences if Claude wraps the JSON
    const clean = textBlock.text.replace(/```[a-z]*\n?/gi, '').trim();
    extracted = JSON.parse(clean);
  } catch (err) {
    console.error('[ai-verify] Claude error:', err);
    return NextResponse.json(
      { error: 'KI-Analyse fehlgeschlagen. Bitte manuell prüfen.' },
      { status: 502 }
    );
  }

  // ── 4. Compare ─────────────────────────────────────────────────────────
  const aiViews    = extracted.views;
  const confidence = extracted.confidence;

  // Match = within ±5 % of claimed views
  const isMatch = aiViews !== null && claimedViews > 0
    ? Math.abs(aiViews - claimedViews) / claimedViews <= 0.05
    : false;

  // Auto-approve only when confidence is high or medium AND numbers match
  const autoApprove = isMatch && confidence !== 'low';

  const now = new Date().toISOString();

  if (autoApprove) {
    // Write to DB: approve + verify, set current_views to the AI-read value
    const verifiedViews = aiViews!;
    await dbQuery(
      `UPDATE cutter_videos
       SET proof_status        = 'proof_approved',
           proof_reviewer_id   = ?,
           proof_reviewer_name = ?,
           proof_reviewed_at   = ?,
           verification_status = 'verified',
           reviewed_by         = ?,
           reviewed_at         = ?,
           current_views       = ?,
           observed_views      = ?
       WHERE id = ?`,
      [auth.id, `KI (${auth.name})`, now, `KI (${auth.name})`, now,
       verifiedViews, verifiedViews, id]
    );

    // Audit log
    await dbQuery(
      `INSERT INTO audit_log
         (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
       VALUES (?, ?, ?, 'video.approve_and_verify', 'video', ?, ?, ?)`,
      [
        randomUUID(), auth.id, auth.name, id,
        JSON.stringify({
          ai_verified:     true,
          extracted_views: aiViews,
          claimed_views:   claimedViews,
          confidence,
          raw_text:        extracted.raw_text,
        }),
        now,
      ]
    );
  }

  return NextResponse.json({
    extracted_views: aiViews,
    claimed_views:   claimedViews,
    confidence,
    raw_text:        extracted.raw_text,
    is_match:        isMatch,
    auto_approved:   autoApprove,
  });
}
