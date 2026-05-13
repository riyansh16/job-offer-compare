/**
 * Single source of truth for admin checks.
 *
 * Admin = the email matches `ADMIN_EMAIL` env var. Used to gate /admin/stats
 * and to hide the admin nav link from non-admins.
 */
import { auth } from './auth';

export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin) return false;
  return email?.trim().toLowerCase() === admin;
}

/** Convenience: returns the signed-in admin's email, or null if not admin. */
export async function getAdminEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  return isAdminEmail(email) ? email : null;
}
