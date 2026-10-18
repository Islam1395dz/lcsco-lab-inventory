# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: Unmatched paths are strictly rejected (`allow read, write: if false;`).
2. **Email Verification & Authentication**: Every write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (`users/{uid}`)**: User documents contain `email` and `fullName`. Only the document owner (`request.auth.uid == uid`) or a verified Admin/Professor (`isAdminOrProf()`) can read a user document. Non-admin users cannot self-assign `ADMIN`, `PROFESSOR`, or `TECHNICIAN` roles on registration, nor can they elevate their own `role` or `status` on update.
4. **Relational Existence (`containers`, `transactions`)**:
   - A `container` cannot be created unless `exists(/databases/$(database)/documents/products/$(incoming().productId))` and `exists(/databases/$(database)/documents/laboratories/$(incoming().laboratoryId))` are true.
   - A `transaction` cannot be created unless `exists(/databases/$(database)/documents/containers/$(incoming().containerId))` and `exists(/databases/$(database)/documents/products/$(incoming().productId))` are true.
5. **Immutable Audit Trail (`transactions/{transactionId}`)**:
   - Strictly append-only. `allow update, delete: if false;` for ALL users, including `ADMIN`.
   - `userId` must match `request.auth.uid`, and `timestamp` must equal `request.time`.
6. **Negative Stock & Terminal State Locking (`containers/{containerId}`)**:
   - `currentQuantity >= 0` and `initialQuantity > 0` at all times.
   - Once a container reaches `DISPOSAL_REQUIRED`, non-Admin/Professor users cannot modify it.
   - `containerId`, `productId`, `initialQuantity`, `unit`, `createdAt`, and `createdBy` are immortal (immutable) after creation.
7. **Secure List Queries**: Every `allow list` rule evaluates `resource.data` (e.g., `resource.data.currentQuantity >= 0`, `resource.data.molecularWeight >= 0`, etc.) and user authorization without delegating security solely to the client.

---

## 2. The "Dirty Dozen" Payloads (Designed to Break Identity, Integrity, and State)

1. **Payload 1 (Self-Assigned Admin Role on User Create)**:
   ```json
   {
     "uid": "attacker_uid",
     "fullName": "Mallory",
     "email": "mallory@lab.edu",
     "role": "ADMIN",
     "laboratoryIds": ["LAB-01"],
     "status": "ACTIVE",
     "createdAt": "SERVER_TIMESTAMP",
     "lastLogin": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Non-bootstrapped user cannot self-assign `ADMIN`).

2. **Payload 2 (Privilege Escalation via User Update)**:
   ```json
   {
     "role": "PROFESSOR",
     "lastLogin": "SERVER_TIMESTAMP"
   }
   ```
   *Expected*: `PERMISSION_DENIED` (Owner update `affectedKeys().hasOnly(['fullName', 'lastLogin'])` blocks `role` modification).

3. **Payload 3 (PII Lateral Read on `users/{otherUid}`)**:
   Authenticated `PHD_STUDENT` (`uid: "student_1"`) attempts `get(/users/student_2)`.
   *Expected*: `PERMISSION_DENIED` (PII isolation restricts read to `isOwner(uid) || isAdminOrProf()`).

4. **Payload 4 (Unverified Email Spoofing Bootstrapped Admin)**:
   Token has `email: "director@lcsco.dz"` and `email_verified: false`.
   *Expected*: `PERMISSION_DENIED` (`isVerified()` requires `request.auth.token.email_verified == true`; `isBootstrappedAdmin()` requires the verified bootstrap claim).

5. **Payload 5 (Shadow Field Injection on Product Create)**:
   ```json
   {
     "productId": "PROD-001",
     "chemicalName": "Acetone",
     "casNumber": "67-64-1",
     "formula": "C3H6O",
     "molecularWeight": 58.08,
     "hazardClass": ["Flammable"],
     "storageRequirements": "Flammable Cabinet",
     "defaultUnit": "mL",
     "minimumStock": 500,
     "reorderLevel": 1000,
     "sdsUrl": "https://example.com/sds",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP",
     "isVerifiedGhostField": true
   }
   ```
   *Expected*: `PERMISSION_DENIED` (`data.keys().hasOnly(...)` blocks shadow fields).

6. **Payload 6 (Orphaned Container Create with Non-Existent Product)**:
   `container` payload with `productId: "NON_EXISTENT_PROD"`.
   *Expected*: `PERMISSION_DENIED` (`exists(.../products/$(incoming().productId))` fails).

7. **Payload 7 (Negative Stock Update on Container)**:
   `container` update setting `currentQuantity: -25`.
   *Expected*: `PERMISSION_DENIED` (`isValidContainer` enforces `data.currentQuantity >= 0`).

8. **Payload 8 (Cross-Unit Mutation on Container Update)**:
   `container` update changing `unit` from `"g"` to `"mL"`.
   *Expected*: `PERMISSION_DENIED` (`incoming().unit == existing().unit` immortal field check + `affectedKeys().hasOnly(...)` rejects unit change).

9. **Payload 9 (Identity Spoofing on Transaction Create)**:
   `transaction` payload where `userId: "professor_uid"` but `request.auth.uid == "student_uid"`.
   *Expected*: `PERMISSION_DENIED` (`incoming().userId == request.auth.uid` fails).

10. **Payload 10 (Audit Trail Tampering — Admin Attempting Transaction Update)**:
    Authenticated `ADMIN` attempts `updateDoc(doc(db, 'transactions', 'TX-001'), { quantityChange: 5 })`.
    *Expected*: `PERMISSION_DENIED` (`allow update: if false;`).

11. **Payload 11 (Audit Trail Destruction — Admin Attempting Transaction Delete)**:
    Authenticated `ADMIN` attempts `deleteDoc(doc(db, 'transactions', 'TX-001'))`.
    *Expected*: `PERMISSION_DENIED` (`allow delete: if false;`).

12. **Payload 12 (Resource Poisoning — 2KB String in Container ID or Reason)**:
    `transaction` payload with `reason` of length 2000 characters.
    *Expected*: `PERMISSION_DENIED` (`data.reason.size() <= 500` fails).

---

## 3. Implementation Status (October 2026)

All payloads are enforced by `firestore.rules`. Runtime proof runs in
`scripts/rules.emulator.test.mjs` (Firestore Emulator executes the real rules):

```
npm run emulators    # firebase emulators:exec --rules=firestore.rules + vitest
```

### Delivered

| Area | Change |
| --- | --- |
| Identity | Firebase Auth only (Google + email/password, **no anonymous**). Bootstrap admin = verified `director@lcsco.dz` (single source; cannot be spoofed with an unverified address). |
| Roles | Resolved from verified Firebase ID-token custom claims (`request.auth.token.role`), with a migration fallback to the Firestore profile document. Self-assignment of roles (create or update) is impossible for any non-admin. |
| Credentials | The `password` / `mustChangePassword` profile fields, the `LCSCO-2026` universal code, `lcsco_pass_*` localStorage mirrors, and all client-side password comparison UI are removed. Passwords belong to Firebase Authentication. |
| `users/{uid}` | Reads bound to `isOwner(uid) || isAdminOrProf() || isActiveLabMember()`; writes blocked to credential-like fields; role/status changes admin-only. |
| Audit trail | `transactions` append-only (`update`/`delete` false), `userId == request.auth.uid`, `timestamp == request.time`, quantity conservation enforced. |
| Actor authenticity | `stockRuptureRequests.reportedByUid == request.auth.uid`, `notifications.createdByUserId == request.auth.uid`, `adjustmentRequests/disposalRequests/purchaseRequests.requestedByUid == request.auth.uid`. |
| Separation of duties | Adjustment/disposal/purchase approvals require a different reviewer (`requestedByUid != request.auth.uid`) and only allow PENDING → APPROVED/REJECTED single-step transitions. |
| Sentinel feature | **JARVIS removed entirely** — component, backend tools service, all `/api/jarvis/*` routes, TTS/proxy surface, Gemini bundling in the client. |
| Express API | No unauthenticated state store (`/api/shared-state*` removed). Single privileged endpoint `/api/inventory/import-document`, gated by `requireAuth` (ID-token verification via Firebase Admin) + `requireRole(ADMIN, PROFESSOR, TECHNICIAN)`, plus `helmet`, `express-rate-limit` (global 300/15min; import 10/15min), cross-origin allowlist, and 10 MB scoped body limit (100 KB default). |
| Demo data | No seeding into production Firestore on login (`seedInitialLabInventory`, `resetToFourTemporaryAccounts` deleted). Demo data survives only as client-side offline preview. |
| Draft rules | `DRAFT_firestore.rules` deleted (contained the anonymous-admin clause). |

### Known deviations / operational requirements

1. **`users` list for active members**: a signed-in active member can *list* profiles
   (name/email/role only). This is required by the client-side role-based notification
   routing. `get` remains owner/admin/prof-staff scoped and no credential fields exist
   anywhere in the schema.
2. **Role claim rollout**: roles currently resolve from the profile document when no
   custom claim exists. Provision claims in Firebase Functions / Admin SDK
   (`setCustomUserClaims(uid, { role })`) and update the profile document together;
   rules prefer the token claim whenever present.
3. **Google sign-in unverified tokens**: `server.ts` treats `google.com` provider
   tokens as verified by design; email/password tokens require `email_verified`.
4. **API keys**: `GEMINI_API_KEY` is server-only (`getGeminiClient` in `server.ts`);
   the committed `firebase-applet-config.json` holds the app's *public* Firebase web
   config (safe by design), while Firestore itself remains the authorization boundary.
5. **Server auth requires credentials**: set `GOOGLE_APPLICATION_CREDENTIALS`; without
   it the Admin SDK cannot verify tokens and `/api/inventory/import-document` fails
   closed with 401/503.
