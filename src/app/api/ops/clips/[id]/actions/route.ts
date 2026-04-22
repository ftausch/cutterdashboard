import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isCutter } from '@/lib/cutter/middleware';
import { randomUUID } from 'crypto';

async function dbQuery(sql: string, args: unknown[] = []) {
  const url = process.env.TURSO_DATABASE_URL!.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN!;
  const res = await fetch(`${url}/v2/pipeline`, {
    method: 'POST',
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
  const data = await res.json();
  const result = data.results?.[0];
  if (result?.type === 'error') throw new Error(result.error.message);
  return result?.response?.result ?? { rows: [], cols: [] };
}

const VALID_ACTIONS = [
  'mark_reviewed',
  'flag',
  'unflag',
  'approve_proof',
  'approve_and_verify',
  'reject_proof',
  'request_proof',
  'start_review',
  'request_reupload',
  'add_note',
  'set_verified',
] as const;

type Action = (typeof VALID_ACTIONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'OPS_WRITE');
  if (!isCutter(auth)) return auth;

  const { id } = await params;
  const body = await request.json();
  const { action, ...actionParams } = body as { action: Action; [key: string]: unknown };

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
  }

  const check = await dbQuery(`SELECT id FROM cutter_videos WHERE id = ?`, [id]);
  if (!(check.rows as unknown[]).length) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const now = new Date().toISOString();

  switch (action) {
    case 'mark_reviewed':
      await dbQuery(
        `UPDATE cutter_videos SET reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
        [auth.name, now, id]
      );
      break;

    case 'flag':
      await dbQuery(
        `UPDATE cutter_videos SET is_flagged = 1, flag_reason = ? WHERE id = ?`,
        [actionParams.reason ?? null, id]
      );
      break;

    case 'unflag':
      await dbQuery(
        `UPDATE cutter_videos SET is_flagged = 0, flag_reason = NULL WHERE id = ?`,
        [id]
      );
      break;

    case 'approve_proof': {
      // If the admin corrected the view count from the screenshot, write it to
      // current_views + observed_views so billing uses the verified number.
      const vv = typeof actionParams.verified_views === 'number' ? actionParams.verified_views : null;
      if (vv !== null) {
        await dbQuery(
          `UPDATE cutter_videos
           SET proof_status         = 'proof_approved',
               proof_reviewer_id    = ?,
               proof_reviewer_name  = ?,
               proof_reviewed_at    = ?,
               verification_status  = 'manual_proof',
               current_views        = ?,
               observed_views       = ?
           WHERE id = ?`,
          [auth.id, auth.name, now, vv, vv, id]
        );
      } else {
        await dbQuery(
          `UPDATE cutter_videos
           SET proof_status         = 'proof_approved',
               proof_reviewer_id    = ?,
               proof_reviewer_name  = ?,
               proof_reviewed_at    = ?,
               verification_status  = 'manual_proof'
           WHERE id = ?`,
          [auth.id, auth.name, now, id]
        );
      }
      break;
    }

    case 'approve_and_verify': {
      // One-click: approve proof AND mark as verified.
      // current_views / observed_views are set to:
      //   • verified_views (admin correction from screenshot), or
      //   • claimed_views  (cutter's stated value, confirmed by admin)
      // This ensures "Beobachtet" always reflects the verified number.
      const vv = typeof actionParams.verified_views === 'number' ? actionParams.verified_views : null;
      await dbQuery(
        `UPDATE cutter_videos
         SET proof_status         = 'proof_approved',
             proof_reviewer_id    = ?,
             proof_reviewer_name  = ?,
             proof_reviewed_at    = ?,
             verification_status  = 'verified',
             reviewed_by          = ?,
             reviewed_at          = ?,
             current_views        = COALESCE(?, claimed_views),
             observed_views       = COALESCE(?, claimed_views)
         WHERE id = ?`,
        [auth.id, auth.name, now, auth.name, now, vv, vv, id]
      );
      break;
    }

    case 'reject_proof':
      await dbQuery(
        `UPDATE cutter_videos
         SET proof_status           = 'proof_rejected',
             proof_rejection_reason = ?,
             proof_reviewer_id      = ?,
             proof_reviewer_name    = ?,
             proof_reviewed_at      = ?
         WHERE id = ?`,
        [actionParams.reason ?? null, auth.id, auth.name, now, id]
      );
      break;

    case 'request_proof':
      await dbQuery(
        `UPDATE cutter_videos
         SET proof_status        = 'proof_requested',
             proof_requested_by  = ?,
             proof_requested_at  = ?
         WHERE id = ?`,
        [auth.name, now, id]
      );
      break;

    case 'start_review':
      await dbQuery(
        `UPDATE cutter_videos
         SET proof_status = 'proof_under_review'
         WHERE id = ? AND proof_status = 'proof_submitted'`,
        [id]
      );
      break;

    case 'request_reupload':
      // Reject the current proof AND request a fresh upload from the cutter.
      // Uses proof_reupload_requested so the cutter can replace without a
      // separate delete step.
      await dbQuery(
        `UPDATE cutter_videos
         SET proof_status           = 'proof_reupload_requested',
             proof_rejection_reason = ?,
             proof_reviewer_id      = ?,
             proof_reviewer_name    = ?,
             proof_reviewed_at      = ?
         WHERE id = ?`,
        [actionParams.reason ?? null, auth.id, auth.name, now, id]
      );
      break;

    case 'add_note':
      await dbQuery(
        `UPDATE cutter_videos SET review_notes = ? WHERE id = ?`,
        [actionParams.note ?? null, id]
      );
      break;

    case 'set_verified':
      await dbQuery(
        `UPDATE cutter_videos SET verification_status = 'verified' WHERE id = ?`,
        [id]
      );
      break;
  }

  // Audit log
  await dbQuery(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, 'video', ?, ?, ?)`,
    [randomUUID(), auth.id, auth.name, `video.${action}`, id, JSON.stringify(actionParams), now]
  );

  return NextResponse.json({ success: true });
}
