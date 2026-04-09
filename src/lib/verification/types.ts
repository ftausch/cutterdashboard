/**
 * Verification Types — Single source of truth for all verification logic.
 *
 * Architecture:
 *   claimed_views  = what the clipper reports (lowest trust)
 *   observed_views = what a third-party scraper or public page sees (medium trust)
 *   api_views      = what an official platform API returns (highest trust)
 *   current_views  = best available number (api > observed > claimed)
 */

// ─── Source of verified data ──────────────────────────────────────────────────

export type VerificationSource =
  | 'official_api'        // YouTube Data API, TikTok Business API, etc.
  | 'third_party_scraper' // Public page scrape, browser automation
  | 'manual_proof'        // Screenshot/video uploaded by clipper, reviewed by ops
  | 'claimed_only'        // Only the clipper's own report, nothing external
  | 'unavailable';        // Could not obtain any external data

// ─── Result of comparing claimed vs verified ─────────────────────────────────

export type VerificationStatus =
  | 'verified'           // Official API confirms within tolerance
  | 'partially_verified' // Scraper/lower-confidence source confirms
  | 'manual_proof'       // Clipper uploaded screenshot, ops reviewed
  | 'claimed_only'       // No external data — trusting clipper's number
  | 'unavailable'        // Cannot verify at all
  | 'unverified';        // Default state, not yet processed

// ─── Discrepancy between claimed and observed ─────────────────────────────────

export type DiscrepancyStatus =
  | 'match'                  // <5% difference
  | 'minor_difference'       // 5–20%
  | 'suspicious_difference'  // 20–50%
  | 'critical_difference'    // >50%
  | 'cannot_verify';         // No external data to compare against

// ─── Confidence model ─────────────────────────────────────────────────────────

/**
 * Confidence is a 0–100 integer indicating how reliable the view count is.
 *
 * Official API:         90–100  (platform-certified data)
 * Third-party scraper:  50–70   (public HTML scraping, can lag or be blocked)
 * Manual proof (ops):   35–50   (screenshot reviewed by a human)
 * Manual proof (auto):  20–35   (screenshot uploaded but not yet reviewed)
 * Claimed only:         5–15    (clipper's self-report, no corroboration)
 * Unavailable:          0       (nothing known)
 */
export const CONFIDENCE_SCORES: Record<VerificationSource, number> = {
  official_api:        95,
  third_party_scraper: 60,
  manual_proof:        40,
  claimed_only:        10,
  unavailable:         0,
};

// ─── Composite video verification state ──────────────────────────────────────

export interface VideoVerification {
  verificationSource: VerificationSource;
  verificationStatus: VerificationStatus;
  discrepancyStatus: DiscrepancyStatus;
  discrepancyPercent: number | null;
  confidenceLevel: number;
  currentViews: number;    // best available view count
  observedViews: number | null;
  apiViews: number | null;
  claimedViews: number | null;
}

// ─── Snapshot types ───────────────────────────────────────────────────────────

export type SnapshotType =
  | 'auto_sync'     // Scheduled cron job
  | 'manual_sync'   // Admin/ops triggered
  | 'proof_upload'  // Triggered when clipper uploads screenshot
  | 'api_pull'      // Direct platform API call
  | 'scrape';       // HTML scrape

// ─── Audit actions ────────────────────────────────────────────────────────────

export type AuditAction =
  | 'video.submitted'
  | 'video.verified'
  | 'video.flagged'
  | 'video.unflagged'
  | 'video.proof_uploaded'
  | 'video.proof_approved'
  | 'video.proof_rejected'
  | 'video.reviewed'
  | 'sync.completed'
  | 'invoice.generated'
  | 'invoice.approved';
