import { randomUUID } from 'crypto';
import type { DbClient } from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────────────

export type AlertType =
  | 'discrepancy_critical'
  | 'discrepancy_suspicious'
  | 'proof_submitted'
  | 'proof_overdue'
  | 'sync_stale'
  | 'no_verification';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'open' | 'acknowledged' | 'in_review' | 'resolved' | 'dismissed';

// ── Alert metadata config ──────────────────────────────────────────────────

interface AlertConfig {
  severity: AlertSeverity;
  titleFn: (meta: Record<string, unknown>) => string;
  detailFn: (meta: Record<string, unknown>) => string;
}

export const ALERT_CONFIG: Record<AlertType, AlertConfig> = {
  discrepancy_critical: {
    severity: 'critical',
    titleFn: () => 'Kritische Diskrepanz',
    detailFn: (m) =>
      `Abweichung von ${m.discrepancy_percent != null ? `${(m.discrepancy_percent as number) > 0 ? '+' : ''}${(m.discrepancy_percent as number).toFixed(1)}%` : '?'}  zwischen Cutter-Angabe und verifizierter View-Zahl`,
  },
  discrepancy_suspicious: {
    severity: 'high',
    titleFn: () => 'Verdächtige Diskrepanz',
    detailFn: (m) =>
      `Abweichung von ${m.discrepancy_percent != null ? `${(m.discrepancy_percent as number) > 0 ? '+' : ''}${(m.discrepancy_percent as number).toFixed(1)}%` : '?'} — manuelle Prüfung empfohlen`,
  },
  proof_submitted: {
    severity: 'medium',
    titleFn: () => 'Beleg eingereicht — Prüfung ausstehend',
    detailFn: () => 'Cutter hat einen Screenshot hochgeladen und wartet auf Genehmigung',
  },
  proof_overdue: {
    severity: 'high',
    titleFn: () => 'Beleg überfällig',
    detailFn: (m) =>
      m.hours_overdue
        ? `Beleg wurde angefordert, aber seit ${m.hours_overdue}h nicht eingereicht`
        : 'Beleg wurde angefordert, aber noch nicht eingereicht (>72h)',
  },
  sync_stale: {
    severity: 'medium',
    titleFn: () => 'Sync veraltet',
    detailFn: (m) =>
      m.last_scraped_at
        ? `Letzter Sync: ${new Date(m.last_scraped_at as string).toLocaleDateString('de-DE')} — mehr als 7 Tage ohne Aktualisierung`
        : 'Clip wurde noch nie synchronisiert',
  },
  no_verification: {
    severity: 'low',
    titleFn: () => 'Keine Verifikation verfügbar',
    detailFn: () =>
      'Clip ist seit mehr als 3 Tagen nicht verifizierbar — kein API-Zugang, kein Scraper-Erfolg',
  },
};

// UI display config (used on the frontend)
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  discrepancy_critical:  'Krit. Diskrepanz',
  discrepancy_suspicious: 'Verd. Diskrepanz',
  proof_submitted:       'Beleg ausstehend',
  proof_overdue:         'Beleg überfällig',
  sync_stale:            'Sync veraltet',
  no_verification:       'Keine Verifikation',
};

export const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

// ── Core functions ─────────────────────────────────────────────────────────

export interface UpsertAlertInput {
  type: AlertType;
  videoId: string;
  cutterId: string;
  cutterName: string;
  meta?: Record<string, unknown>;
}

/**
 * Create or update an alert.
 * - If no alert exists for (type, video_id): insert as 'open'
 * - If existing is dismissed/resolved: re-open (condition re-triggered)
 * - If existing is open/acknowledged/in_review: update detail + meta only
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE for atomicity.
 */
export async function upsertAlert(db: DbClient, input: UpsertAlertInput): Promise<void> {
  const config = ALERT_CONFIG[input.type];
  const meta = input.meta ?? {};
  const title = config.titleFn(meta);
  const detail = config.detailFn(meta);
  const metaJson = JSON.stringify(meta);
  const now = new Date().toISOString();

  try {
    await db.execute({
      sql: `INSERT INTO ops_alerts
              (id, type, severity, video_id, cutter_id, cutter_name, status,
               title, detail, meta, triggered_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(type, video_id) DO UPDATE SET
              severity     = excluded.severity,
              cutter_name  = excluded.cutter_name,
              title        = excluded.title,
              detail       = excluded.detail,
              meta         = excluded.meta,
              updated_at   = excluded.updated_at,
              -- Re-open if previously dismissed or resolved
              status       = CASE WHEN ops_alerts.status IN ('dismissed','resolved')
                               THEN 'open' ELSE ops_alerts.status END,
              triggered_at = CASE WHEN ops_alerts.status IN ('dismissed','resolved')
                               THEN excluded.triggered_at ELSE ops_alerts.triggered_at END,
              dismissed_at     = CASE WHEN ops_alerts.status = 'dismissed' THEN NULL ELSE ops_alerts.dismissed_at END,
              resolved_at      = CASE WHEN ops_alerts.status = 'resolved'  THEN NULL ELSE ops_alerts.resolved_at END,
              resolved_by_id   = CASE WHEN ops_alerts.status = 'resolved'  THEN NULL ELSE ops_alerts.resolved_by_id END,
              resolved_by_name = CASE WHEN ops_alerts.status = 'resolved'  THEN NULL ELSE ops_alerts.resolved_by_name END`,
      args: [
        randomUUID(),
        input.type,
        config.severity,
        input.videoId,
        input.cutterId,
        input.cutterName,
        title,
        detail,
        metaJson,
        now,
        now,
        now,
      ],
    });
  } catch (err) {
    console.error('[ops_alerts] upsert failed:', err);
  }
}

/**
 * Mark an alert resolved. Condition no longer applies.
 * Only affects open/acknowledged/in_review alerts; ignores dismissed/already-resolved.
 */
export async function resolveAlert(
  db: DbClient,
  type: AlertType,
  videoId: string,
  resolvedById?: string,
  resolvedByName?: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db.execute({
      sql: `UPDATE ops_alerts
            SET status = 'resolved',
                resolved_at = ?,
                updated_at = ?,
                resolved_by_id = ?,
                resolved_by_name = ?
            WHERE type = ? AND video_id = ?
              AND status NOT IN ('resolved', 'dismissed')`,
      args: [now, now, resolvedById ?? null, resolvedByName ?? null, type, videoId],
    });
  } catch (err) {
    console.error('[ops_alerts] resolve failed:', err);
  }
}
