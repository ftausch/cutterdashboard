/**
 * Verification + Discrepancy Engine
 *
 * Data hierarchy (highest to lowest trust):
 *   api_views > observed_views > claimed_views
 */

import type {
  VerificationSource,
  VerificationStatus,
  DiscrepancyStatus,
  VideoVerification,
} from './types';
import { CONFIDENCE_SCORES } from './types';

export function resolveVerificationSource(
  platform: string,
  hasApiViews: boolean,
  hasObservedViews: boolean,
  hasManualProof: boolean,
  hasClaim: boolean
): VerificationSource {
  if (hasApiViews) return 'official_api';
  if (hasObservedViews) return 'third_party_scraper';
  if (hasManualProof) return 'manual_proof';
  if (hasClaim) return 'claimed_only';
  return 'unavailable';
  void platform;
}

export function resolveVerificationStatus(
  source: VerificationSource,
  discrepancy: DiscrepancyStatus,
  proofStatus: string | null
): VerificationStatus {
  if (source === 'official_api') {
    return (discrepancy === 'match' || discrepancy === 'minor_difference') ? 'verified' : 'partially_verified';
  }
  if (source === 'third_party_scraper') return 'partially_verified';
  if (source === 'manual_proof') return proofStatus === 'approved' ? 'manual_proof' : 'manual_proof';
  if (source === 'claimed_only') return 'claimed_only';
  return 'unavailable';
}

export function calculateDiscrepancy(
  verifiedViews: number | null,
  claimedViews: number | null,
  source: VerificationSource
): { status: DiscrepancyStatus; percent: number | null } {
  if (source === 'claimed_only' || source === 'unavailable') return { status: 'cannot_verify', percent: null };
  if (claimedViews === null || claimedViews === undefined) return { status: 'cannot_verify', percent: null };
  if (!verifiedViews || verifiedViews === 0) return { status: 'cannot_verify', percent: null };

  const percent = (Math.abs(claimedViews - verifiedViews) / verifiedViews) * 100;
  let status: DiscrepancyStatus;
  if (percent < 5) status = 'match';
  else if (percent < 20) status = 'minor_difference';
  else if (percent < 50) status = 'suspicious_difference';
  else status = 'critical_difference';

  return { status, percent: Math.round(percent * 10) / 10 };
}

export function computeConfidence(
  source: VerificationSource,
  discrepancy: DiscrepancyStatus,
  proofReviewed: boolean
): number {
  let base = CONFIDENCE_SCORES[source];
  if (discrepancy === 'minor_difference') base = Math.max(0, base - 10);
  if (discrepancy === 'suspicious_difference') base = Math.max(0, base - 25);
  if (discrepancy === 'critical_difference') base = Math.max(0, base - 45);
  if (source === 'manual_proof' && proofReviewed) base = Math.min(100, base + 15);
  return Math.round(base);
}

export function resolveBestViews(
  apiViews: number | null,
  observedViews: number | null,
  claimedViews: number | null
): number {
  if (apiViews !== null && apiViews > 0) return apiViews;
  if (observedViews !== null && observedViews > 0) return observedViews;
  if (claimedViews !== null && claimedViews > 0) return claimedViews;
  return 0;
}

export function computeVerification(input: {
  platform: string;
  claimedViews: number | null;
  observedViews: number | null;
  apiViews: number | null;
  hasManualProof: boolean;
  proofStatus: string | null;
  proofReviewed: boolean;
}): VideoVerification {
  const { platform, claimedViews, observedViews, apiViews, hasManualProof, proofStatus, proofReviewed } = input;
  const source = resolveVerificationSource(platform, apiViews !== null, observedViews !== null, hasManualProof, claimedViews !== null);
  const externalViews = apiViews ?? observedViews;
  const { status: discrepancyStatus, percent: discrepancyPercent } = calculateDiscrepancy(externalViews, claimedViews, source);
  const verificationStatus = resolveVerificationStatus(source, discrepancyStatus, proofStatus);
  const confidenceLevel = computeConfidence(source, discrepancyStatus, proofReviewed);
  const currentViews = resolveBestViews(apiViews, observedViews, claimedViews);
  return { verificationSource: source, verificationStatus, discrepancyStatus, discrepancyPercent, confidenceLevel, currentViews, observedViews, apiViews, claimedViews };
}

export function shouldAlert(discrepancy: DiscrepancyStatus): { alert: boolean; severity: 'medium' | 'high' | null } {
  if (discrepancy === 'suspicious_difference') return { alert: true, severity: 'medium' };
  if (discrepancy === 'critical_difference') return { alert: true, severity: 'high' };
  return { alert: false, severity: null };
}

export const SOURCE_LABELS: Record<VerificationSource, string> = {
  official_api:        'Offizielle API',
  third_party_scraper: 'Öffentlich (Scraper)',
  manual_proof:        'Manueller Beleg',
  claimed_only:        'Nur Angabe',
  unavailable:         'Nicht verfügbar',
};

export const DISCREPANCY_LABELS: Record<DiscrepancyStatus, string> = {
  match:                 'Übereinstimmung (<5%)',
  minor_difference:      'Kleine Abweichung (5–20%)',
  suspicious_difference: 'Verdächtig (20–50%)',
  critical_difference:   'Kritisch (>50%)',
  cannot_verify:         'Nicht prüfbar',
};
