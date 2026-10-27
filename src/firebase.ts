import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { FirestoreErrorInfo, OperationType } from './types/inventory';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Validates connection to Firestore on boot as required by the Firebase Integration specification.
 */
export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.info('Firestore connection test successful');
  } catch (error: any) {
    const msg = String(error?.message || error?.code || '');
    if (msg.includes('client is offline') || msg.includes('offline')) {
      console.warn('Firestore connection test skipped: client appears offline');
      return;
    }
    // With strict Firestore rules, the test path is not readable - this is expected
    if (
      msg.includes('permission') ||
      msg.includes('insufficient') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('not found') ||
      msg.includes('NOT_FOUND')
    ) {
      console.debug('[Firestore] Connectivity ping denied by rules (expected)');
      return;
    }
    console.error('Firestore connection test failed:', error);
  }
}

testFirestoreConnection();

/**
 * Returns a Firebase ID token for authenticated calls to the Express API
 * (e.g., POST /api/inventory/import-document), or null when signed out.
 */
export async function getApiAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Standardized Firestore Error Handler
 * Wraps permission or operational failures into a structured JSON error payload.
 */
function buildFirestoreUserMessage(
  code: string,
  operationType: OperationType,
  path: string | null,
  rawMessage: string
): string {
  const target = path ? ` "${path}"` : '';
  const isWrite = operationType !== OperationType.GET && operationType !== OperationType.LIST;
  const noChange = isWrite ? ' No changes were saved.' : '';

  if (code.includes('permission-denied')) {
    return `Permission denied while accessing${target}. Your account is not authorized for this operation, or your session is out of date. Sign out and back in, then retry.${noChange}`;
  }
  if (code.includes('not-found')) {
    return `The selected record${target} no longer exists. Refresh the inventory and choose an existing record.${noChange}`;
  }
  if (code.includes('failed-precondition') || code.includes('aborted')) {
    return `This record changed at the same time as your request. Refresh and retry.${noChange}`;
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return `Firestore is temporarily unreachable. Check your connection and retry.${noChange}`;
  }
  return rawMessage;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const userMessage = buildFirestoreUserMessage(code, operationType, path, rawMessage);

  // Preserve custom business logic validation errors clearly while also logging structured info.
  const errInfo: FirestoreErrorInfo = {
    error: rawMessage,
    code: code || null,
    userMessage,
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Helper to extract a human-readable message from either a structured FirestoreErrorInfo JSON
 * or a standard Error instance for clean UI display.
 */
export function parseDisplayError(err: unknown): string {
  if (!err) return 'An unexpected error occurred.';
  const message = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(message) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed.userMessage === 'string') {
      return parsed.userMessage;
    }
    if (parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    // Not a JSON string, return raw message
  }
  return message;
}
