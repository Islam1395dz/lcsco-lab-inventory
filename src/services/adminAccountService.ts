import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, getApiAuthToken } from '../firebase';

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
  /**
   * How the invitation reached the member: `welcome` means the server emailed
   * the temporary password; `setup-link` means Firebase emailed a link the
   * member uses to choose their own password.
   */
  emailMode?: 'welcome' | 'setup-link';
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
 * Sends Firebase's built-in "reset your password" email and reuses it as the
 * account-setup link. Google delivers it from the project's firebaseapp.com
 * domain to any address, so invitations work without an external mail provider,
 * a verified custom domain, or SMTP — all of which are unavailable on Render
 * Free (SMTP ports blocked) or require domain ownership neither is available.
 */
export async function sendAccountSetupEmail(email: string): Promise<{ sent: boolean; error?: string }> {
  const address = email.trim();
  if (!address) return { sent: false, error: 'No email address to send to.' };
  try {
    await sendPasswordResetEmail(auth, address, {
      url: `${window.location.origin}/`,
      handleCodeInApp: false,
    });
    return { sent: true };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code || '';
    const message = err instanceof Error ? err.message : String(err);
    if (code === 'auth/too-many-requests') {
      return {
        sent: false,
        error: 'Firebase rate-limited the invitation email — try again in a few minutes.',
      };
    }
    if (code === 'auth/unauthorized-continue-uri') {
      return {
        sent: false,
        error: 'This domain is not authorized in Firebase Authentication settings.',
      };
    }
    return { sent: false, error: `Firebase: ${message.slice(0, 300)}` };
  }
}

/**
 * The server tries its configured mail provider first (welcome email with the
 * temporary password). When that provider is unavailable — for example while
 * the Brevo key is not set — Google's built-in email is used instead so the
 * member still receives a working invitation.
 */
async function ensureInviteDelivered(account: ProvisionedAccount): Promise<ProvisionedAccount> {
  if (account.emailSent) return account;
  const invite = await sendAccountSetupEmail(account.email);
  if (invite.sent) {
    return { ...account, emailSent: true, emailError: undefined, emailMode: 'setup-link' };
  }
  return { ...account, emailError: invite.error || account.emailError };
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
  const provisioned = await adminApiFetch<ProvisionedAccount>('/api/admin/create-user', input);
  return ensureInviteDelivered(provisioned);
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

/**
 * Issues a fresh temporary password for a member who has not completed their
 * first login yet, and re-sends the welcome email. The server refuses for
 * members who already replaced their temporary password.
 */
export async function resendWelcomeEmail(targetUid: string): Promise<ProvisionedAccount> {
  const reissued = await adminApiFetch<ProvisionedAccount>('/api/admin/resend-welcome', { targetUid });
  return ensureInviteDelivered(reissued);
}

/**
 * Marks a member's Firebase Auth email as verified. Required for accounts
 * provisioned before the server started creating email-verified users: those
 * members can read the inventory (reads only need sign-in) but every write is
 * rejected by the Firestore rules with "Missing or insufficient permissions".
 * The Director runs this once; the member must then sign out and back in so the
 * refreshed ID token carries `email_verified: true`.
 */
export async function repairMemberAccess(
  targetUid: string
): Promise<{ success: boolean; email?: string }> {
  return adminApiFetch<{ success: boolean; email?: string }>(
    '/api/admin/repair-access',
    { targetUid }
  );
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
