/**
 * audit-describe.ts
 *
 * Pure client-safe helper that turns raw audit_log rows into
 * human-readable German sentences.
 *
 * No Node.js imports — can be used in both server and client components.
 */

function fmtNum(n: unknown): string {
  if (n == null) return '—';
  const num = Number(n);
  if (!isNaN(num)) return new Intl.NumberFormat('de-DE').format(num);
  return String(n);
}

/**
 * Returns a single human-readable sentence describing what happened.
 * All text is in German.
 */
export function describeAuditEntry(
  action: string | null,
  metaJson: string | null,
  actorName: string | null,
): string {
  const actor = actorName ?? 'Unbekannt';
  let m: Record<string, unknown> = {};
  try {
    if (metaJson) m = JSON.parse(metaJson);
  } catch {
    // ignore malformed JSON
  }

  switch (action) {
    // ── Clip lifecycle ──────────────────────────────────────────────
    case 'video_submit':
      return `${actor} hat einen Clip eingereicht`;
    case 'video_delete':
      return `${actor} hat einen Clip gelöscht`;

    // ── Claimed views ───────────────────────────────────────────────
    case 'video.claimed_views_updated': {
      const from = m.from != null ? fmtNum(m.from) : null;
      const to   = m.to   != null ? fmtNum(m.to)   : null;
      if (from != null && to != null)
        return `${actor} hat Claimed Views von ${from} auf ${to} aktualisiert`;
      if (to != null)
        return `${actor} hat Claimed Views auf ${to} gesetzt`;
      return `${actor} hat Claimed Views aktualisiert`;
    }

    // ── Proof upload ────────────────────────────────────────────────
    case 'video.proof_uploaded': {
      const fileName = m.file_name ? ` (${m.file_name})` : '';
      return m.is_reupload
        ? `${actor} hat einen Beleg ersetzt${fileName}`
        : `${actor} hat einen Beleg hochgeladen${fileName}`;
    }

    // ── Proof review ────────────────────────────────────────────────
    case 'video.approve_proof':
    case 'proof_approve':
      return `${actor} hat den Beleg genehmigt`;

    case 'video.reject_proof':
    case 'proof_reject':
      return m.reason
        ? `${actor} hat den Beleg abgelehnt — ${m.reason}`
        : `${actor} hat den Beleg abgelehnt`;

    case 'video.request_reupload':
      return m.reason
        ? `${actor} hat neuen Upload angefordert — ${m.reason}`
        : `${actor} hat neuen Upload angefordert`;

    case 'video.request_proof':
    case 'proof_request':
      return `${actor} hat einen Beleg angefordert`;

    case 'video.start_review':
    case 'proof_start_review':
      return `${actor} hat die Prüfung gestartet`;

    // ── Proof file (per-file granular actions) ──────────────────────
    case 'video.proof_file_approve':
      return `${actor} hat die Beleg-Datei genehmigt`;

    case 'video.proof_file_reject':
      return m.note
        ? `${actor} hat die Beleg-Datei abgelehnt — ${m.note}`
        : `${actor} hat die Beleg-Datei abgelehnt`;

    case 'video.proof_file_reset':
      return `${actor} hat die Beleg-Datei zurückgesetzt`;

    // ── Review actions ──────────────────────────────────────────────
    case 'video.mark_reviewed':
      return `${actor} hat den Clip als geprüft markiert`;

    case 'video.set_verified':
      return `${actor} hat den Clip als verifiziert gesetzt`;

    case 'video.flag':
      return m.reason
        ? `${actor} hat den Clip geflaggt — ${m.reason}`
        : `${actor} hat den Clip geflaggt`;

    case 'video.unflag':
      return `${actor} hat die Flagge entfernt`;

    // ── Notes ───────────────────────────────────────────────────────
    case 'video.add_note':
    case 'note_add':
      return `${actor} hat eine interne Notiz hinzugefügt`;

    case 'note_delete':
      return `${actor} hat eine Notiz gelöscht`;

    // ── Invoice ─────────────────────────────────────────────────────
    case 'invoice_generate':
      return `${actor} hat eine Rechnung erstellt`;

    case 'invoice_sent':
      return `${actor} hat eine Rechnung versendet`;

    case 'invoice_paid':
      return `${actor} hat eine Rechnung als bezahlt markiert`;

    // ── Cutter management ───────────────────────────────────────────
    case 'cutter_create':
      return `${actor} hat einen Cutter angelegt`;

    case 'cutter_deactivate':
      return `${actor} hat einen Cutter deaktiviert`;

    case 'cutter_reactivate':
      return `${actor} hat einen Cutter reaktiviert`;

    case 'cutter_delete':
      return `${actor} hat einen Cutter gelöscht`;

    // ── Alerts ──────────────────────────────────────────────────────
    case 'alert_resolve':
      return `${actor} hat einen Alert gelöst`;

    case 'alert_dismiss':
      return `${actor} hat einen Alert verworfen`;

    // ── Fallback ────────────────────────────────────────────────────
    default:
      return action ? `${actor}: ${action}` : actor;
  }
}

/** Colour dot class for a given action, for use in list views. */
export function auditDotClass(action: string | null): string {
  switch (action) {
    case 'video_submit':
    case 'video.proof_uploaded':
      return 'bg-blue-400';

    case 'video.approve_proof':
    case 'proof_approve':
    case 'video.proof_file_approve':
    case 'video.set_verified':
    case 'invoice_generate':
    case 'invoice_paid':
    case 'cutter_create':
    case 'alert_resolve':
      return 'bg-emerald-400';

    case 'video.reject_proof':
    case 'proof_reject':
    case 'video.proof_file_reject':
    case 'video.flag':
    case 'video_delete':
    case 'cutter_deactivate':
      return 'bg-red-400';

    case 'video.request_reupload':
    case 'video.request_proof':
    case 'proof_request':
    case 'alert_dismiss':
      return 'bg-orange-400';

    case 'video.start_review':
    case 'proof_start_review':
    case 'video.mark_reviewed':
      return 'bg-purple-400';

    case 'video.claimed_views_updated':
      return 'bg-cyan-400';

    case 'video.unflag':
    case 'video.add_note':
    case 'note_add':
      return 'bg-muted-foreground/40';

    default:
      return 'bg-muted-foreground/25';
  }
}
