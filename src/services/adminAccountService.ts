import { getApiAuthToken } from '../firebase';

/**
 * Client for the Director-controlled account-provisioning API (server.ts).
 *
 * Firebase Auth accounts can only be created or deleted with privileged
 * credentials, so this is done by the Express backend using the Admin SDK
 * (see POST /api/admin/*). The Director's own verified ID token authorizes
 * every call; temporary passwords are generated server-side and are never
 * persisted anywhere by this application.
 */

export interface ProvisionedAccount {
  uid: string;
  email: string;
  /** Returned exactly once — shown to the Director as a fallback AND emailed to the new member. */
  tempPassword: string;
  emailSent: boolean;
  /** Provider-side reason when the welcome email could not be delivered. */
  emailError?: string;
}

async function adminApiFetch<T>(path: string, body: unknown): Promise<T> {
  const token = await getApiAuthToken();
  if (!token) {
    throw new Error('You must be signed in to manage accounts.');
  }
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  if (!res.ok || (data && data.error)) {
    throw new Error((data && data.error) || 'The server rejected this account operation.');
  }
  return data as T;
}

/**
 * Creates a real Firebase Auth account (email + server-generated temporary
 * password), its Firestore profile, and emails the welcome message with the
 * first-login credentials to the new member.
 */
export async function provisionLabMemberAccount(input: {
  email: string;
  fullName: string;
  role: string;
  laboratoryIds: string[];
}): Promise<ProvisionedAccount> {
  return adminApiFetch<ProvisionedAccount>('/api/admin/create-user', input);
}

/**
 * Deletes the Firebase Auth account AND its Firestore profile. The server
 * refuses to delete the caller's own account. Idempotent on missing accounts.
 */
export async function deleteLabMemberAccount(targetUid: string): Promise<{ success: boolean }> {
  return adminApiFetch<{ success: boolean }>('/api/admin/delete-user', { targetUid });
}

/**
 * Called after the current user successfully changes their own temporary
 * password with the Firebase client SDK — clears the server-side
 * `mustChangePassword` flag on their profile. Acts only on the caller's
 * account (uid comes from the verified ID token server-side).
 */
export async function completeOnboardingPasswordChange(): Promise<{ success: boolean }> {
  return adminApiFetch<{ success: boolean }>('/api/admin/complete-password-change', {});
}

/** Which slice of the official reference inventory to import. */
export type ReferenceInventoryKind = 'locations' | 'products' | 'containers';

export interface ReferenceInventoryImportResult {
  kind: string;
  /** Number of documents actually written (0 when the slice was skipped). */
  written: number;
  /** True when the target collection already held data and nothing was written. */
  skipped: boolean;
  reason?: string;
}

/**
 * Materialises one slice of the laboratory's official reference inventory
 * (the 21-page cabinet/reagent inventory) into the live database. The server
 * writes with the Admin SDK, so the strict per-document client rules are not in
 * the bulk-import path. Idempotent per collection unless `force` is set.
 */
export async function importReferenceInventory(
  kind: ReferenceInventoryKind,
  items: unknown[],
  force = false
): Promise<ReferenceInventoryImportResult> {
  return adminApiFetch<ReferenceInventoryImportResult>('/api/admin/seed-inventory', {
    kind,
    items,
    force,
  });
}
