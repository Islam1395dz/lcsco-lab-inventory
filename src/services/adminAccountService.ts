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
