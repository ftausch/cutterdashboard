/**
 * Snapshot Service — Immutable historical view count records
 *
 * Rule: NEVER update a snapshot. Only INSERT new ones.
 * This gives us a full timeline for trend analysis and audit trails.
 */

import { randomUUID } from 'crypto';
import type { SnapshotType, VerificationSource } from './types';

interface SnapshotInput {
  videoId: string;
  views: number;
  observedViews?: number | null;
  apiViews?: number | null;
  claimedViews?: number | null;
  verificationSource: VerificationSource;
  confidenceLevel: number;
  snapshotType: SnapshotType;
  success: boolean;
  errorMessage?: string | null;
}

async function dbExec(sql: string, args: unknown[] = []) {
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
            args: args.map((a) =>
              a === null || a === undefined
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
  return result?.response?.result;
}

/**
 * Record a new immutable snapshot. Never modifies existing rows.
 */
export async function recordSnapshot(input: SnapshotInput): Promise<string> {
  const id = randomUUID();

  await dbExec(
    `INSERT INTO cutter_view_snapshots
      (id, video_id, views, observed_views, api_views, claimed_views,
       verification_source, confidence_level, snapshot_type,
       success, error_message, scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      id,
      input.videoId,
      input.views,
      input.observedViews ?? null,
      input.apiViews ?? null,
      input.claimedViews ?? null,
      input.verificationSource,
      input.confidenceLevel,
      input.snapshotType,
      input.success ? 1 : 0,
      input.errorMessage ?? null,
    ]
  );

  return id;
}

/**
 * Get snapshot history for a video, newest first.
 */
export async function getSnapshotHistory(videoId: string, limit = 30) {
  const result = await dbExec(
    `SELECT id, views, observed_views, api_views, claimed_views,
            verification_source, confidence_level, snapshot_type,
            success, error_message, scraped_at
     FROM cutter_view_snapshots
     WHERE video_id = ?
     ORDER BY scraped_at DESC
     LIMIT ?`,
    [videoId, limit]
  );

  return (result?.rows ?? []).map((row: unknown[]) => ({
    id: (row[0] as { value: string }).value,
    views: (row[1] as { value: number | null }).value,
    observedViews: (row[2] as { value: number | null }).value,
    apiViews: (row[3] as { value: number | null }).value,
    claimedViews: (row[4] as { value: number | null }).value,
    verificationSource: (row[5] as { value: string }).value,
    confidenceLevel: (row[6] as { value: number }).value,
    snapshotType: (row[7] as { value: string }).value,
    success: (row[8] as { value: number }).value === 1,
    errorMessage: (row[9] as { value: string | null }).value,
    scrapedAt: (row[10] as { value: string }).value,
  }));
}

/**
 * Get view count trend: first snapshot vs latest snapshot.
 * Returns growth rate and data points for charting.
 */
export async function getViewTrend(videoId: string) {
  const snapshots = await getSnapshotHistory(videoId, 90);
  if (snapshots.length < 2) return null;

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];
  const growth = latest.views && oldest.views
    ? ((latest.views - oldest.views) / oldest.views) * 100
    : null;

  return {
    latestViews: latest.views,
    oldestViews: oldest.views,
    growthPercent: growth ? Math.round(growth * 10) / 10 : null,
    dataPoints: snapshots.map((s) => ({ date: s.scrapedAt, views: s.views })).reverse(),
  };
}
