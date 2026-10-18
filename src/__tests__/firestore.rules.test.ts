import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';

/**
 * Structural verification of the Firestore security rules.
 *
 * These assertions complement the emulator-backed integration suite
 * (scripts/rules.emulator.test.mjs) which executes the real "Dirty Dozen"
 * payloads against `firebase emulators:exec`.
 */
describe('Firestore Security Rules — security invariants present in rules source', () => {
  const rulesPath = new URL('../firestore.rules', import.meta.url).pathname;
  const rulesContent = readFileSync(rulesPath, 'utf-8');

  it('keeps the default-deny catch-all as the first match block', () => {
    const first = rulesContent.slice(0, 400);
    expect(first).toContain('match /{document=**} {');
    expect(first).toContain('allow read, write: if false;');
  });

  it('requires an email-verified identity for every write via isVerified()', () => {
    const guard = rulesContent.slice(
      rulesContent.indexOf('function isVerified()'),
      rulesContent.indexOf('function incoming()')
    );
    expect(guard).toContain('request.auth.token.email_verified == true');
    // Anonymous sessions must never count as verified identities.
    expect(guard).not.toContain("sign_in_provider == 'anonymous'");
  });

  it('never grants admin to anonymous sign-ins', () => {
    const boot = rulesContent.slice(
      rulesContent.indexOf('function isBootstrappedAdmin()'),
      rulesContent.indexOf('function userDocExists()')
    );
    expect(boot).not.toContain("'anonymous'");
  });

  it('resolves roles from verified custom claims (and never self-assignment)', () => {
    expect(rulesContent).toContain('function tokenRole()');
    expect(rulesContent).toContain("request.auth.token.role is string");
  });

  it('isolates users/{uid} reads to owner and authorized roles', () => {
    const block = rulesContent.slice(
      rulesContent.indexOf('match /users/{uid}'),
      rulesContent.indexOf('match /laboratories/{labId}')
    );
    expect(block).toContain('(isOwner(uid) || isAdminOrProf() || isActiveLabMember())');
    // No unguarded reads: the old "any signed-in user reads any profile" hole.
    expect(block).toContain(
      'allow get: if isSignedIn() && (isOwner(uid) || isAdminOrProf() || isActiveLabMember());'
    );
    expect(block).not.toMatch(/allow (get|list): if isSignedIn\(\)\s*;/);
  });

  it('keeps the mustChangePassword flag server-managed (validated but never client-writable)', () => {
    const block = rulesContent.slice(
      rulesContent.indexOf('match /users/{uid}'),
      rulesContent.indexOf('match /laboratories/{labId}')
    );
    expect(block).not.toContain("hasOnly(['fullName', 'lastLogin', 'laboratoryIds', 'avatarUrl', 'password'");
    // The flag is accepted by schema validation so login-time writes still pass,
    // but it must never appear in an owner or admin update allowlist.
    const validationLine = rulesContent.split('\n').filter((l) => l.includes("hasOnly(['uid'"));
    expect(validationLine.length).toBe(1);
    expect(validationLine[0]).toContain("'mustChangePassword'");
    // Every restricted-update allowlist in the users update block must exclude the flag.
    const allowlists = block.match(/affectedKeys\(\)\.hasOnly\(\[[^\]]*\]\)/g) || [];
    expect(allowlists.length).toBeGreaterThan(0);
    allowlists.forEach((entry) => expect(entry).not.toContain('mustChangePassword'));
  });

  it('prevents any authenticated user from self-creating a profile with a privileged role', () => {
    const block = rulesContent.slice(
      rulesContent.indexOf('match /users/{uid}'),
      rulesContent.indexOf('match /laboratories/{labId}')
    );
    expect(block).not.toContain("incoming().role == 'ADMIN'");
  });

  it('keeps transactions strictly append-only and server-timestamped', () => {
    const block = rulesContent.slice(
      rulesContent.indexOf('match /transactions/{transactionId}'),
      rulesContent.indexOf('match /physicalLocations/{locationId}')
    );
    expect(block).toContain('data.timestamp == request.time');
    expect(block).toContain('incoming().userId == request.auth.uid');
    expect(block).toContain('data.quantityBefore + data.quantityChange == data.quantityAfter');
    expect(block).toContain('allow update: if false;');
    expect(block).toContain('allow delete: if false;');
  });

  it('enforces actor authenticity on reports and notifications', () => {
    const ruptures = rulesContent.slice(
      rulesContent.indexOf('match /stockRuptureRequests/{ruptureId}'),
      rulesContent.indexOf('match /notifications/{notificationId}')
    );
    expect(ruptures).toContain('incoming().reportedByUid == request.auth.uid');

    const notifications = rulesContent.slice(
      rulesContent.indexOf('match /notifications/{notificationId}'),
      rulesContent.indexOf('match /systemSettings/{settingId}')
    );
    expect(notifications).toContain('incoming().createdByUserId == request.auth.uid');
  });

  it('blocks self-approval of adjustment and disposal workflows', () => {
    const adjustments = rulesContent.slice(
      rulesContent.indexOf('match /adjustmentRequests/{requestId}'),
      rulesContent.indexOf('match /disposalRequests/{disposalId}')
    );
    expect(adjustments).toContain("existing().status == 'PENDING'");
    expect(adjustments).toContain('incoming().diff(existing()).affectedKeys().hasOnly([\'status\'])');
    expect(adjustments).toContain('existing().requestedByUid != request.auth.uid');

    const disposals = rulesContent.slice(
      rulesContent.indexOf('match /disposalRequests/{disposalId}'),
      rulesContent.indexOf('match /purchaseRequests/{purchaseId}')
    );
    expect(disposals).toContain('existing().requestedByUid != request.auth.uid');
  });

  it('enforces relational existence and non-negative stock on containers', () => {
    const block = rulesContent.slice(
      rulesContent.indexOf('match /containers/{containerId}'),
      rulesContent.indexOf('match /transactions/{transactionId}')
    );
    expect(block).toContain('exists(/databases/$(database)/documents/products/$(incoming().productId))');
    expect(block).toContain('data.currentQuantity is number && data.currentQuantity >= 0');
    expect(block).toContain('incoming().unit == existing().unit');
    expect(block).toContain('incoming().createdBy == request.auth.uid');
  });

  it('enforces strict key allowlists and string size bounds across all entities', () => {
    expect(rulesContent).toContain('data.reason is string && data.reason.size() >= 1 && data.reason.size() <= 500');
    expect(rulesContent).toContain('data.keys().hasOnly([');
  });
});

describe('Rules test environment', () => {
  it('ships the emulator-backed payload suite referenced by the npm scripts', () => {
    expect(existsSync(new URL('../scripts/rules.emulator.test.mjs', import.meta.url).pathname)).toBe(true);
  });
});
