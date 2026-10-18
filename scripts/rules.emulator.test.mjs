/**
 * Firestore Security Rules — real payload tests ("Dirty Dozen").
 *
 * Runs against the Firestore EMULATOR executing the actual firestore.rules
 * file. Start the emulator first:
 *
 *   npm run emulators          # firebase emulators:exec + this suite
 *   # or
 *   firebase emulators:start --rules=firestore.rules --project=local-lcsco
 *
 * Each test proves a rule is ENFORCED, unlike string-grepping the rules file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const PROJECT_ID = 'local-lcsco';
const RULES_PATH = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const BOOTSTRAP_EMAIL = 'director@lcsco.dz';

let testEnv;

const uid = (name) => `uid-${name}`;

function makeUser(name, { email = `${name}@lcsco.dz`, emailVerified = true } = {}) {
  return testEnv.authenticatedContext(uid(name), {
    email,
    email_verified: emailVerified,
  });
}

/** A signed-in context with the given name and email claim. */
async function provisionProfile(name, role, { email = `${name}@lcsco.dz` } = {}) {
  // The Director (bootstrap identity) creates every profile.
  const director = makeUser('director', { email: BOOTSTRAP_EMAIL });
  await assertSucceeds(
    setDoc(doc(director.firestore(), 'users', uid(name)), {
      uid: uid(name),
      fullName: `Member ${name}`,
      email,
      role,
      laboratoryIds: ['LCSCO'],
      status: 'ACTIVE',
      createdAt: new Date(),
      lastLogin: new Date(),
    })
  );
}

/** Mirrors the role fallback in rules: no custom claims are provisioned here,
 *  so users resolve roles from their profile document. */
const baseUserDoc = {
  uid: 'REPLACE_ME',
  fullName: 'Member',
  email: 'someone@lcsco.dz',
  role: 'PHD_STUDENT',
  laboratoryIds: ['LCSCO'],
  status: 'ACTIVE',
  createdAt: new Date(),
  lastLogin: new Date(),
};

const baseProductDoc = {
  productId: 'PROD-1',
  chemicalName: 'Acetone',
  casNumber: '67-64-1',
  formula: 'C3H6O',
  molecularWeight: 58.08,
  hazardClass: [],
  storageRequirements: 'Flammable solvent cabinet',
  defaultUnit: 'g',
  minimumStock: 100,
  reorderLevel: 200,
  sdsUrl: '',
};

const baseContainerDoc = {
  containerId: 'CONT-1',
  productId: 'PROD-1',
  laboratoryId: 'LCSCO',
  initialQuantity: 500,
  currentQuantity: 500,
  unit: 'g',
  location: {
    building: 'B1',
    room: '204',
    unit: 'FLAM-01',
    shelf: '1',
    position: '01',
    code: 'R204-FLAM01-L-S01-P01',
  },
  storageCondition: 'Flammable solvent cabinet',
  status: 'NORMAL',
  lotNumber: 'LOT-1',
  supplier: 'Sigma',
  expiryDate: '2027-01-01',
  createdBy: uid('tech'),
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf-8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
      port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1]) || 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Phase 0 — the Dirty Dozen payloads against live rules', () => {
  it('Anonymous / unverified identities can never appoint themselves admins', async () => {
    // 1. Unauthenticated user attempt
    await assertFails(
      setDoc(testEnv.unauthenticatedContext().firestore().doc('users/temp-admin'), {
        ...baseUserDoc,
        uid: 'temp-admin',
        role: 'ADMIN',
      })
    );

    // 2. Email/password user with verified=false cannot create any profile
    await assertFails(
      setDoc(
        makeUser('someone', { emailVerified: false }).firestore().doc('users/temp-admin'),
        { ...baseUserDoc, uid: 'temp-admin', role: 'ADMIN', email: 'someone@lcsco.dz' }
      )
    );

    // 3. A random VERIFIED user still cannot self-assign ADMIN
    await assertFails(
      setDoc(makeUser('mallory').firestore().doc(`users/${uid('mallory')}`), {
        ...baseUserDoc,
        uid: uid('mallory'),
        email: 'mallory@lcsco.dz',
        role: 'ADMIN',
      })
    );

    // 4a. ... nor Professor / Technician
    await assertFails(
      setDoc(makeUser('mallory').firestore().doc(`users/${uid('mallory')}`), {
        ...baseUserDoc,
        uid: uid('mallory'),
        email: 'mallory@lcsco.dz',
        role: 'PROFESSOR',
      })
    );

    // 4b. The bootstrap verified identity IS allowed to create its own ADMIN profile
    await assertSucceeds(
      setDoc(makeUser('director', { email: BOOTSTRAP_EMAIL }).firestore().doc(`users/${uid('director')}`), {
        ...baseUserDoc,
        uid: uid('director'),
        email: BOOTSTRAP_EMAIL,
        role: 'ADMIN',
      })
    );
  });

  it('matches profile row updates — a member can edit only their own non-privileged fields', async () => {
    await provisionProfile('phd1', 'PHD_STUDENT');

    // 5. Self update of display name is fine
    const self = makeUser('phd1');
    await assertSucceeds(
      updateDoc(self.firestore().doc(`users/${uid('phd1')}`), { fullName: 'New Name' })
    );

    // 6. Self promotion attempt is denied
    await assertFails(
      updateDoc(self.firestore().doc(`users/${uid('phd1')}`), { role: 'ADMIN' })
    );

    // 7. Credential smuggling attempt (legacy plaintext password field) is denied
    await assertFails(
      updateDoc(self.firestore().doc(`users/${uid('phd1')}`), {
        role: 'PHD_STUDENT',
        password: 'hax',
        mustChangePassword: false,
      })
    );
  });

  it('transactions are append-only and server-timestamped', async () => {
    await provisionProfile('tech', 'TECHNICIAN');
    const dir = makeUser('director', { email: BOOTSTRAP_EMAIL });
    await assertSucceeds(
      setDoc(dir.firestore().doc('products/PROD-1'), baseProductDoc)
    );
    const tech = makeUser('tech');
    await assertSucceeds(
      setDoc(tech.firestore().doc('containers/CONT-1'), baseContainerDoc)
    );

    const tx = {
      transactionId: 'TX-1',
      type: 'WITHDRAWAL',
      userId: uid('tech'),
      userName: 'Member tech',
      laboratoryId: 'LCSCO',
      containerId: 'CONT-1',
      productId: 'PROD-1',
      quantityChange: -50,
      quantityBefore: 500,
      quantityAfter: 450,
      unit: 'g',
      oldLocation: 'R204-FLAM01-L-S01-P01',
      newLocation: 'R204-FLAM01-L-S01-P01',
      oldStatus: 'NORMAL',
      newStatus: 'NORMAL',
      reason: 'Bench test',
      timestamp: serverTimestamp(),
    };

    // 8. Legit write by the acting user succeeds
    await assertSucceeds(
      setDoc(tech.firestore().doc('transactions/TX-1'), tx)
    );

    // 9. Forging someone else's userId fails
    await assertFails(
      setDoc(tech.firestore().doc('transactions/TX-9'), {
        ...tx,
        transactionId: 'TX-9',
        userId: uid('director'),
      })
    );

    // 10. Rewriting history (update / delete) fails
    await assertFails(updateDoc(tech.firestore().doc('transactions/TX-1'), { quantityAfter: 999 }));
    await assertFails(deleteDoc(tech.firestore().doc('transactions/TX-1')));
    await assertFails(
      deleteDoc(
        makeUser('director', { email: BOOTSTRAP_EMAIL }).firestore().doc('transactions/TX-1')
      )
    );

    // 11. Quantity conservation is enforced
    await assertFails(
      setDoc(tech.firestore().doc('transactions/TX-2'), {
        ...tx,
        transactionId: 'TX-2',
        quantityAfter: 600,
      })
    );
  });

  it('reports and notifications carry the true actor identity', async () => {
    await provisionProfile('phd2', 'PHD_STUDENT');
    const phd = makeUser('phd2');

    // 12. Fake reporter fails
    await assertFails(
      setDoc(phd.firestore().doc('stockRuptureRequests/RUP-1'), {
        ruptureId: 'RUP-1',
        containerId: 'CONT-1',
        productId: 'PROD-1',
        chemicalName: 'Acetone',
        casNumber: '67-64-1',
        formula: 'C3H6O',
        laboratoryId: 'LCSCO',
        locationCode: 'R204-FLAM01-L-S01-P01',
        currentInventoryQuantity: 500,
        unit: 'g',
        currentInventoryStatus: 'NORMAL',
        reportedByUid: uid('director'),
        reportedByName: 'Member phd2',
        reportedByRole: 'PHD_STUDENT',
        reportedAt: new Date(),
        priority: 'HIGH',
        status: 'REPORTED',
        reportCount: 1,
        reporters: [],
      })
    );

    // ... truthful actor succeeds
    await assertSucceeds(
      setDoc(phd.firestore().doc('stockRuptureRequests/RUP-1'), {
        ruptureId: 'RUP-1',
        containerId: 'CONT-1',
        productId: 'PROD-1',
        chemicalName: 'Acetone',
        casNumber: '67-64-1',
        formula: 'C3H6O',
        laboratoryId: 'LCSCO',
        locationCode: 'R204-FLAM01-L-S01-P01',
        currentInventoryQuantity: 500,
        unit: 'g',
        currentInventoryStatus: 'NORMAL',
        reportedByUid: uid('phd2'),
        reportedByName: 'Member phd2',
        reportedByRole: 'PHD_STUDENT',
        reportedAt: new Date(),
        priority: 'HIGH',
        status: 'REPORTED',
        reportCount: 1,
        reporters: [],
      })
    );

    // Fake notification sender fails
    await assertFails(
      setDoc(phd.firestore().doc('notifications/NTF-1'), {
        notificationId: 'NTF-1',
        type: 'STOCK_RUPTURE',
        title: 'Hi',
        message: 'Forged alert',
        priority: 'HIGH',
        recipientUserId: uid('director'),
        createdByUserId: uid('director'),
        createdAt: new Date(),
        isRead: false,
        isResolved: false,
      })
    );
  });

  it('separation of duties: nobody approves their own adjustment or disposal request', async () => {
    await provisionProfile('prof1', 'PROFESSOR');
    await provisionProfile('tech2', 'TECHNICIAN');

    const req = {
      requestId: 'ADJ-1',
      containerId: 'CONT-1',
      productId: 'PROD-1',
      chemicalName: 'Acetone',
      laboratoryId: 'LCSCO',
      previousQuantity: 500,
      newQuantity: 450,
      difference: -50,
      unit: 'g',
      reason: 'Physical count',
      requestedByUid: uid('tech2'),
      requestedByName: 'Member tech2',
      requestedByRole: 'TECHNICIAN',
      requestedAt: new Date(),
      status: 'PENDING',
    };
    const tech = makeUser('tech2');
    await assertSucceeds(setDoc(tech.firestore().doc('adjustmentRequests/ADJ-1'), req));

    // 13. The requester self-approves -> DENIED
    await assertFails(
      updateDoc(tech.firestore().doc('adjustmentRequests/ADJ-1'), { status: 'APPROVED' })
    );

    // A different reviewer approves -> ALLOWED
    const prof = makeUser('prof1');
    await assertSucceeds(
      updateDoc(prof.firestore().doc('adjustmentRequests/ADJ-1'), { status: 'APPROVED' })
    );

    // ... and re-transitioning an already-approved request is denied
    await assertFails(
      updateDoc(prof.firestore().doc('adjustmentRequests/ADJ-1'), { status: 'REJECTED' })
    );
  });

  it('the default-deny catch-all stops access to unexpected collections', async () => {
    await provisionProfile('phd3', 'PHD_STUDENT');
    const phd = makeUser('phd3');
    await assertFails(getDoc(phd.firestore().doc('secrets/top-s')));
    await assertFails(setDoc(phd.firestore().doc('secrets/top-s'), { x: 1 }));
  });
});
