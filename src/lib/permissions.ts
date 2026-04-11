/**
 * Central permissions system (v0.8.0)
 *
 * Single source of truth for all role-based access control.
 * To add a new role: extend Role, add to ROLE_HIERARCHY, update PERMISSIONS arrays.
 * To add a new permission: add a key to PERMISSIONS with the allowed roles.
 * No API route or component should hard-code role names — use can() instead.
 */

export type Role = 'super_admin' | 'ops_manager' | 'cutter' | 'viewer';

/**
 * Numeric hierarchy for atLeastRole() comparisons.
 * Higher = more access.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 4,
  ops_manager: 3,
  cutter:      2,
  viewer:      1,
};

/**
 * Human-readable labels for UI display.
 */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Admin',
  ops_manager: 'Ops Manager',
  cutter:      'Cutter',
  viewer:      'Viewer',
};

/**
 * All named permissions. Each maps to the roles that are allowed.
 * Add new permissions here — never inline role checks elsewhere.
 */
export const PERMISSIONS = {
  // ── Ops / internal ──────────────────────────────────────────────────────────
  OPS_READ:              ['super_admin', 'ops_manager'],
  OPS_WRITE:             ['super_admin', 'ops_manager'],
  ALERT_MANAGE:          ['super_admin', 'ops_manager'],
  VERIFICATION_MANAGE:   ['super_admin', 'ops_manager'],
  ANALYTICS_READ:        ['super_admin', 'ops_manager'],
  SCRAPE_STATUS:         ['super_admin', 'ops_manager'],

  // ── Notes ───────────────────────────────────────────────────────────────────
  NOTE_READ_INTERNAL:    ['super_admin', 'ops_manager'],
  NOTE_READ_CUTTER:      ['super_admin', 'ops_manager', 'cutter'],
  NOTE_CREATE:           ['super_admin', 'ops_manager'],
  NOTE_EDIT_OWN:         ['super_admin', 'ops_manager'],
  NOTE_DELETE_OWN:       ['super_admin', 'ops_manager'],
  NOTE_DELETE_ANY:       ['super_admin'],

  // ── Content attributes ───────────────────────────────────────────────────────
  ATTRIBUTES_WRITE:      ['super_admin', 'ops_manager'],

  // ── Clips ───────────────────────────────────────────────────────────────────
  CLIP_READ_OWN:         ['super_admin', 'ops_manager', 'cutter', 'viewer'],
  CLIP_READ_ALL:         ['super_admin', 'ops_manager'],
  CLIP_SUBMIT:           ['super_admin', 'ops_manager', 'cutter'],
  CLIP_DELETE_OWN:       ['super_admin', 'ops_manager', 'cutter'],
  CLIP_DELETE_ANY:       ['super_admin', 'ops_manager'],
  CLIP_FLAG:             ['super_admin', 'ops_manager'],

  // ── Sensitive clip fields (discrepancy, confidence, flag_reason) ─────────────
  CLIP_SENSITIVE_FIELDS: ['super_admin', 'ops_manager'],

  // ── Proof ───────────────────────────────────────────────────────────────────
  PROOF_UPLOAD:          ['super_admin', 'ops_manager', 'cutter'],
  PROOF_STATUS_OWN:      ['super_admin', 'ops_manager', 'cutter'],

  // ── Invoices ────────────────────────────────────────────────────────────────
  INVOICE_READ:          ['super_admin', 'ops_manager', 'cutter'],
  INVOICE_MANAGE:        ['super_admin', 'ops_manager'],

  // ── Accounts ────────────────────────────────────────────────────────────────
  ACCOUNT_MANAGE:        ['super_admin', 'ops_manager', 'cutter'],

  // ── Episodes ────────────────────────────────────────────────────────────────
  EPISODE_READ_OWN:      ['super_admin', 'ops_manager', 'cutter', 'viewer'],
  EPISODE_MANAGE_OWN:    ['super_admin', 'ops_manager', 'cutter'],

  // ── Performance / dashboard ──────────────────────────────────────────────────
  DASHBOARD_READ:        ['super_admin', 'ops_manager', 'cutter', 'viewer'],
  PERFORMANCE_READ:      ['super_admin', 'ops_manager', 'cutter', 'viewer'],

  // ── Notifications / reminders ────────────────────────────────────────────────
  NOTIFICATION_READ:     ['super_admin', 'ops_manager', 'cutter'],

  // ── Admin / user management ──────────────────────────────────────────────────
  USER_READ:             ['super_admin'],
  USER_MANAGE:           ['super_admin'],
  ROLE_ASSIGN:           ['super_admin'],
  SYSTEM_SETTINGS:       ['super_admin'],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 * Primary function — use this everywhere instead of role-name comparisons.
 */
export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

/**
 * Check if a role meets a minimum role threshold (hierarchy-based).
 * Use sparingly — prefer named permissions over hierarchy checks.
 */
export function atLeastRole(userRole: Role, minRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

// ── Convenience shorthands ────────────────────────────────────────────────────

export function hasOpsAccess(role: Role): boolean {
  return can(role, 'OPS_READ');
}

export function isAdmin(role: Role): boolean {
  return role === 'super_admin';
}

export function isCutterOrAbove(role: Role): boolean {
  return atLeastRole(role, 'cutter');
}

export function isViewerOnly(role: Role): boolean {
  return role === 'viewer';
}
