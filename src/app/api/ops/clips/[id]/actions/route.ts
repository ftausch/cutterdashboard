import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';
import { can, type Role } from '@/lib/permissions';
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
  'reject_proof',
  'request_proof',
  'add_note',
  'set_verified',
] as const;

type Action = (typeof VALID_ACTIONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(cookieStore.get('cutter_session')?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(session.role as Role, 'OPS_WRITE')) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, ...actionParams } = body as { action: Action; [key: string]: unknown };

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
  }

  // Verify video exists
  const check = await dbQuery(`SELECT id FROM cutter_videos WHERE id = ?`, [id]);
  if (!(check.rows as unknown[]).length) {
    return NextResponse.json({ error: 'Video nicht gefunden' }, { status: 404 });
  }

  const now = new Date().toISOString();

  switch (action) {
    case 'mark_reviewed':
      await dbQuery(
        `UPDATE cutter_videos SET reviewed_by = ?, reviewed_at = ? WHERE id = ?`,
        [session.name, now, id]
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

    case 'approve_proof':
      await dbQuery(
        `UPDATE cutter_videos SET proof_status = 'approved' WHERE id = ?`,
        [id]
      );
      break;

    case 'reject_proof':
      await dbQuery(
        `UPDATE cutter_videos SET proof_status = 'rejected', proof_notes = ? WHERE id = ?`,
        [actionParams.reason ?? null, id]
      );
      break;

    case 'request_proof':
      await dbQuery(
        `UPDATE cutter_videos SET proof_status = 'requested' WHERE id = ?`,
        [id]
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

  // Write audit log
  await dbQuery(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, 'video', ?, ?, ?)`,
    [
      randomUUID(),
      session.id,
      session.name,
      `video.${action}`,
      id,
      JSON.stringify(actionParams),
      now,
    ]
  );

  return NextResponse.json({ success: true });
}
