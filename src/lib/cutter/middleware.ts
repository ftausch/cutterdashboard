import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie, hasOpsAccess, isSuperAdmin, type CutterRow } from './auth';
import { can, type Permission, type Role } from '@/lib/permissions';

/**
 * Require cutter authentication for an API route.
 * Returns the cutter row if authenticated, or a 401 JSON response.
 */
export async function requireCutterAuth(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const token = request.cookies.get('cutter_session')?.value;
  const cutter = await getSessionFromCookie(token);

  if (!cutter) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  return cutter;
}

/**
 * Require a specific named permission.
 * Primary auth wrapper — prefer this over requireOpsAccess / requireCutterAdmin.
 *
 * Usage:
 *   const auth = await requirePermission(request, 'OPS_READ');
 *   if (!isCutter(auth)) return auth;
 */
export async function requirePermission(
  request: NextRequest,
  permission: Permission
): Promise<CutterRow | NextResponse> {
  const result = await requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!can(result.role as Role, permission)) {
    return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  }

  return result;
}

/**
 * Require super_admin role (full access).
 * @deprecated Prefer requirePermission(request, 'USER_MANAGE')
 */
export async function requireCutterAdmin(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const result = await requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!isSuperAdmin(result)) {
    return NextResponse.json({ error: 'Kein Admin-Zugang' }, { status: 403 });
  }

  return result;
}

/**
 * Require ops access (super_admin or ops_manager).
 * @deprecated Prefer requirePermission(request, 'OPS_READ')
 */
export async function requireOpsAccess(
  request: NextRequest
): Promise<CutterRow | NextResponse> {
  const result = await requireCutterAuth(request);
  if (result instanceof NextResponse) return result;

  if (!hasOpsAccess(result)) {
    return NextResponse.json({ error: 'Kein Ops-Zugang' }, { status: 403 });
  }

  return result;
}

/**
 * Type guard: check if the result is a cutter row (not an error response).
 */
export function isCutter(
  result: CutterRow | NextResponse
): result is CutterRow {
  return !(result instanceof NextResponse);
}
