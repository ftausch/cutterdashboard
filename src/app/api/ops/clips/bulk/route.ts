import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { randomUUID } from 'crypto';

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

const BULK_ACTIONS = [
  'approve_proof',
  'reject_proof',
  'request_proof',
  'flag',
  'unflag',
  'mark_reviewed',
] as const;

type BulkAction = (typeof BULK_ACTIONS)[number];

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  let body: { clipIds: string[]; action: BulkAction; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const { clipIds, action, reason } = body;

  if (!BULK_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
  }
  if (!Array.isArray(clipIds) || clipIds.length === 0) {
    return NextResponse.json({ error: 'Keine Clips ausgewählt' }, { status: 400 });
  }
  if (clipIds.length > 100) {
    return NextResponse.json({ error: 'Maximal 100 Clips pro Bulk-Aktion' }, { status: 400 });
  }

  const now      = new Date().toISOString();
  const failed: string[] = [];
  let   processed = 0;

  for (const id of clipIds) {
    try {
      switch (action) {
        case 'approve_proof':
          await dbQuery(
            `UPDATE cutter_videos
             SET proof_status        = 'proof_approved',
                 proof_reviewer_id   = ?,
                 proof_reviewer_name = ?,
                 proof_reviewed_at   = ?,
                 verification_status = 'manual_proof'
             WHERE id = ?`,
            [auth.id, auth.name, now, id]
          );
          break;

        case 'reject_proof':
          await dbQuery(
            `UPDATE cutter_videos
             SET proof_status           = 'proof_rejected',
                 proof_rejection_reason = ?,
                 proof_reviewer_id      = ?,
                 proof_reviewer_name    = ?,
                 proof_reviewed_at      = ?
             WHERE id = ?`,
            [reason ?? null, auth.id, auth.name, now, id]
          );
          break;

        case 'request_proof':
          await dbQuery(
            `UPDATE cutter_videos
             SET proof_status       = 'proof_requested',
                 proof_requested_by = ?,
                 proof_requested_at = ?
             WHERE id = ?`,
            [auth.name, now, id]
          );
          break;

        case 'flag':
          await dbQuery(
            `UPDATE cutter_videos SET is_flagged = 1, flag_reason = ? WHERE id = ?`,
            [reason ?? null, id]
          );
          break;

        case 'unflag':
          await dbQuery(
            `UPDATE cutter_videos SET is_flagged = 0, flag_reason = NULL WHERE id = ?`,
            [id]
          );
          break;

        case 'mark_reviewed':
          await dbQuery(
            `UPDATE cutter_videos SET reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
            [auth.name, now, id]
          );
          break;
      }

      // Audit log entry per clip
      await dbQuery(
        `INSERT INTO audit_log
           (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
         VALUES (?, ?, ?, ?, 'video', ?, ?, ?)`,
        [
          randomUUID(),
          auth.id,
          auth.name,
          `video.${action}`,
          id,
          JSON.stringify({ reason: reason ?? null, bulk: true }),
          now,
        ]
      );

      processed++;
    } catch (e) {
      console.error(`[bulk] failed on clip ${id}:`, e);
      failed.push(id);
    }
  }

  return NextResponse.json({
    processed,
    failed,
    total:   clipIds.length,
    success: failed.length === 0,
  });
}
