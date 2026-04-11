/**
 * Manueller Sync-Trigger für Admins
 * POST /api/admin/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookie } from '@/lib/cutter/auth';
import { can, type Role } from '@/lib/permissions';
import { runSync, startSyncLog, writeSyncLog } from '@/lib/sync/engine';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  void request;
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(
    cookieStore.get('cutter_session')?.value
  );

  if (!session || !can(session.role as Role, 'SYSTEM_SETTINGS')) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

  const start = Date.now();
  try {
    await startSyncLog();
    const results = await runSync();
    const totalMs = Date.now() - start;
    await writeSyncLog(results, totalMs);

    return NextResponse.json({
      success: true,
      durationMs: totalMs,
      accounts: results.length,
      videosFound: results.reduce((s, r) => s + r.videosFound, 0),
      videosCreated: results.reduce((s, r) => s + r.videosCreated, 0),
      videosUpdated: results.reduce((s, r) => s + r.videosUpdated, 0),
      results,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// GET — letztes Sync-Ergebnis laden
export async function GET(request: NextRequest) {
  void request;
  const cookieStore = await cookies();
  const session = await getSessionFromCookie(
    cookieStore.get('cutter_session')?.value
  );

  if (!session || !can(session.role as Role, 'SCRAPE_STATUS')) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }

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
            sql: `SELECT sync_type, status, result, started_at, finished_at, duration_ms
                  FROM sync_log
                  WHERE sync_type = 'views'
                  ORDER BY id DESC
                  LIMIT 5`,
          },
        },
        { type: 'close' },
      ],
    }),
  });

  const data = await res.json();
  const rows = data.results?.[0]?.response?.result?.rows ?? [];

  const logs = rows.map((row: unknown[]) => ({
    syncType: (row[0] as { value: string }).value,
    status: (row[1] as { value: string }).value,
    result: (() => { try { return JSON.parse((row[2] as { value: string })?.value ?? 'null'); } catch { return null; } })(),
    startedAt: (row[3] as { value: string }).value,
    finishedAt: (row[4] as { value: string | null }).value,
    durationMs: (row[5] as { value: number | null }).value,
  }));

  return NextResponse.json({ logs });
}
