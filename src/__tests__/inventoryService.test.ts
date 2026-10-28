import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  assertRolePermission,
  buildStorageLocation,
  calculateAdditionMutation,
  calculateCorrectionMutation,
  calculateWithdrawalMutation,
  computeStockStatus,
  hasRolePermission,
  isValidEntityId,
} from '../services/inventoryDomain';
import {
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  NotificationPriority,
  NotificationType,
  PermissionAction,
  StockRuptureStatus,
  TransactionType,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types/inventory';
import {
  buildNotificationsForRecipients,
  markAllUserNotificationsReadInList,
  markNotificationReadInList,
  processStockRuptureReport,
  transitionStockRuptureWorkflow,
} from '../services/notificationService';

// Mock Firestore for inventoryService transaction tests
const mockTransactionGet = vi.fn();
const mockTransactionUpdate = vi.fn();
const mockTransactionSet = vi.fn();

vi.mock('firebase/firestore', async () => {
  return {
    collection: vi.fn(),
    doc: vi.fn((_db, col, id) => ({ path: `${col}/${id}`, id })),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP'),
    runTransaction: vi.fn(async (_db, callback) => {
      const tx = {
        get: mockTransactionGet,
        update: mockTransactionUpdate,
        set: mockTransactionSet,
      };
      return await callback(tx);
    }),
  };
});

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user_1', email: 'researcher@lab.edu', emailVerified: true } },
  handleFirestoreError: vi.fn((err) => {
    throw err;
  }),
}));

import {
  correctContainerInventory,
  flagContainerIssue,
  resolveFlaggedContainer,
  withdrawChemicalStock,
} from '../services/inventoryService';

function createSampleContainer(overrides: Partial<ChemicalContainer> = {}): ChemicalContainer {
  return {
    containerId: 'SOL-001',
    productId: 'PROD-ACETONE',
    laboratoryId: 'LAB-SYNTH-01',
    initialQuantity: 500,
    currentQuantity: 500,
    unit: ChemicalUnit.GRAM,
    location: {
      building: 'CHM',
      room: '304',
      unit: 'FLAM-A',
      shelf: 'S1',
      position: 'P01',
      code: 'CHM-304-FLAM-A-S1-P01',
    },
    storageCondition: 'Flammable Cabinet',
    status: ContainerStatus.NORMAL,
    lotNumber: 'LOT-001',
    supplier: 'Sigma-Aldrich',
    expiryDate: '2028-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'admin_1',
    ...overrides,
  };
}

describe('Inventory Domain Logic & Transaction Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Prevents negative stock on withdrawal and throws explicit Negative Stock Error', () => {
    const bottle = createSampleContainer({ currentQuantity: 100, initialQuantity: 500 });
    expect(() =>
      calculateWithdrawalMutation(bottle, 150, ChemicalUnit.GRAM, 'Over-withdrawal attempt')
    ).toThrow(/Negative Stock Error/);
  });

  it('2. Enforces strict unit safety and prevents cross-unit math (e.g. mL vs g)', () => {
    const bottle = createSampleContainer({ unit: ChemicalUnit.GRAM });
    expect(() =>
      calculateWithdrawalMutation(bottle, 25, ChemicalUnit.MILLILITER, 'Cross-unit withdrawal')
    ).toThrow(/Unit Mismatch Error/);

    expect(() =>
      calculateAdditionMutation(bottle, 25, ChemicalUnit.LITER, 'Cross-unit addition')
    ).toThrow(/Unit Mismatch Error/);
  });

  it('3. Automatically updates container status to LOW_STOCK (<=25%) and NEARLY_EMPTY (<=10%)', () => {
    const bottle = createSampleContainer({ initialQuantity: 500, currentQuantity: 200 });

    // Withdraw 75g -> 125g remaining (exactly 25% of 500g) -> LOW_STOCK
    const lowStockRes = calculateWithdrawalMutation(
      bottle,
      75,
      ChemicalUnit.GRAM,
      'Reaction step 1'
    );
    expect(lowStockRes.quantityAfter).toBe(125);
    expect(lowStockRes.newStatus).toBe(ContainerStatus.LOW_STOCK);

    // Withdraw 150g -> 50g remaining (exactly 10% of 500g) -> NEARLY_EMPTY
    const nearlyEmptyRes = calculateWithdrawalMutation(
      bottle,
      150,
      ChemicalUnit.GRAM,
      'Reaction step 2'
    );
    expect(nearlyEmptyRes.quantityAfter).toBe(50);
    expect(nearlyEmptyRes.newStatus).toBe(ContainerStatus.NEARLY_EMPTY);
  });

  it('4. Blocks routine withdrawals on containers with NEEDS_IDENTIFICATION or QUARANTINED status', () => {
    const quarantinedBottle = createSampleContainer({
      status: ContainerStatus.QUARANTINED,
    });
    expect(() =>
      calculateWithdrawalMutation(quarantinedBottle, 10, ChemicalUnit.GRAM, 'Attempted withdrawal')
    ).toThrow(/Container Locked Error/);

    const needsIdBottle = createSampleContainer({
      status: ContainerStatus.NEEDS_IDENTIFICATION,
    });
    expect(() =>
      calculateWithdrawalMutation(needsIdBottle, 10, ChemicalUnit.GRAM, 'Attempted withdrawal')
    ).toThrow(/Container Locked Error/);
  });

  it('5. Calculates inventory check discrepancy corrections accurately (Workflow C)', () => {
    // DB says 500g, physical bottle measured at 470g -> delta -30g
    const bottle = createSampleContainer({ initialQuantity: 500, currentQuantity: 500 });
    const corr = calculateCorrectionMutation(
      bottle,
      470,
      ChemicalUnit.GRAM,
      'Measured on analytical balance #MT-04'
    );
    expect(corr.quantityBefore).toBe(500);
    expect(corr.quantityAfter).toBe(470);
    expect(corr.quantityChange).toBe(-30);
    expect(corr.newStatus).toBe(ContainerStatus.NORMAL);
  });

  it('6. Executes atomic Firestore runTransaction for withdrawChemicalStock and appends audit log', async () => {
    const bottle = createSampleContainer({ initialQuantity: 500, currentQuantity: 60 });
    mockTransactionGet.mockResolvedValueOnce({
      exists: () => true,
      data: () => bottle,
    });

    const result = await withdrawChemicalStock({
      containerId: 'SOL-001',
      amount: 25,
      unit: ChemicalUnit.GRAM,
      reason: 'Bench withdrawal for titration',
      actor: {
        uid: 'student_1',
        fullName: 'Dr. Clara Vance',
        role: UserRole.PHD_STUDENT,
      },
    });

    // 60g - 25g = 35g (7% of 500g -> NEARLY_EMPTY)
    expect(result.newQuantity).toBe(35);
    expect(result.newStatus).toBe(ContainerStatus.NEARLY_EMPTY);
    expect(mockTransactionUpdate).toHaveBeenCalledTimes(1);
    expect(mockTransactionSet).toHaveBeenCalledTimes(1);

    const auditPayload = mockTransactionSet.mock.calls[0][1];
    expect(auditPayload.type).toBe(TransactionType.WITHDRAWAL);
    expect(auditPayload.quantityBefore).toBe(60);
    expect(auditPayload.quantityAfter).toBe(35);
    expect(auditPayload.quantityChange).toBe(-25);
    expect(auditPayload.newStatus).toBe(ContainerStatus.NEARLY_EMPTY);
  });

  it('7. Enforces RBAC on resolveFlaggedContainer (blocks PHD_STUDENT, allows PROFESSOR)', async () => {
    await expect(
      resolveFlaggedContainer({
        containerId: 'ACD-201',
        resolution: 'RESTORE',
        reason: 'Attempt by student',
        actor: {
          uid: 'student_1',
          fullName: 'Student',
          role: UserRole.PHD_STUDENT,
        },
      })
    ).rejects.toThrow(/Permission Denied/);

    const flaggedBottle = createSampleContainer({
      containerId: 'ACD-201',
      status: ContainerStatus.NEEDS_IDENTIFICATION,
    });
    mockTransactionGet.mockResolvedValueOnce({
      exists: () => true,
      data: () => flaggedBottle,
    });

    const profRes = await resolveFlaggedContainer({
      containerId: 'ACD-201',
      resolution: 'DISPOSAL',
      reason: 'Label destroyed; approved for hazardous disposal',
      actor: {
        uid: 'prof_1',
        fullName: 'Prof. H. Lindqvist',
        role: UserRole.PROFESSOR,
      },
    });

    expect(profRes.newStatus).toBe(ContainerStatus.DISPOSAL_REQUIRED);
  });

  it('8. Validates ID regex and builds standardized StorageLocation codes', () => {
    expect(isValidEntityId('SOL-001')).toBe(true);
    expect(isValidEntityId('INVALID ID WITH SPACES!')).toBe(false);

    const loc = buildStorageLocation({
      building: 'CHM',
      room: '304',
      unit: 'CAB 1',
      side: 'Right',
      shelf: '2',
      position: 'P04',
    });
    expect(loc.code).toBe('CAB 1- Level 2- Right side');
  });

  it('9. Enforces the role permission matrix (Director, Secretary, Professor, Technician, PhD Student) at action level', () => {
    // 1. DIRECTOR (ADMIN) — Full access, no restrictions
    expect(hasRolePermission(UserRole.ADMIN, PermissionAction.MANAGE_USERS)).toBe(true);
    expect(hasRolePermission(UserRole.ADMIN, PermissionAction.ARCHIVE_REMOVE_CHEMICAL)).toBe(true);
    expect(hasRolePermission(UserRole.ADMIN, PermissionAction.APPROVE_STOCK_ADJUSTMENT)).toBe(true);

    // 2. SECRETARY — Exactly the same permissions as the Director
    for (const action of Object.values(PermissionAction)) {
      expect(hasRolePermission(UserRole.SECRETARY, action)).toBe(true);
    }

    // 3. PROFESSOR — Can approve purchases & disposals, add chemicals, export, but CANNOT manage users or permanently delete
    expect(hasRolePermission(UserRole.PROFESSOR, PermissionAction.APPROVE_PURCHASE_REQUEST)).toBe(true);
    expect(hasRolePermission(UserRole.PROFESSOR, PermissionAction.APPROVE_DISPOSAL_REQUEST)).toBe(true);
    expect(hasRolePermission(UserRole.PROFESSOR, PermissionAction.MANAGE_USERS)).toBe(false);
    expect(hasRolePermission(UserRole.PROFESSOR, PermissionAction.ARCHIVE_REMOVE_CHEMICAL)).toBe(false);

    // 4. TECHNICIAN — Can submit adjustments, receive deliveries, record approved disposal, move locations, CANNOT approve own adjustments/disposals/purchases
    expect(hasRolePermission(UserRole.TECHNICIAN, PermissionAction.SUBMIT_STOCK_ADJUSTMENT)).toBe(true);
    expect(hasRolePermission(UserRole.TECHNICIAN, PermissionAction.APPROVE_STOCK_ADJUSTMENT)).toBe(false);
    expect(hasRolePermission(UserRole.TECHNICIAN, PermissionAction.APPROVE_DISPOSAL_REQUEST)).toBe(false);
    expect(hasRolePermission(UserRole.TECHNICIAN, PermissionAction.RECORD_APPROVED_DISPOSAL)).toBe(true);
    expect(hasRolePermission(UserRole.TECHNICIAN, PermissionAction.RECEIVE_VALIDATED_DELIVERY)).toBe(true);

    // 5. PHD STUDENT — Can record consumption, create purchase/disposal requests, CANNOT add/edit master chemicals or adjust stock
    expect(hasRolePermission(UserRole.PHD_STUDENT, PermissionAction.RECORD_CONSUMPTION)).toBe(true);
    expect(hasRolePermission(UserRole.PHD_STUDENT, PermissionAction.CREATE_PURCHASE_REQUEST)).toBe(true);
    expect(hasRolePermission(UserRole.PHD_STUDENT, PermissionAction.CREATE_DISPOSAL_REQUEST)).toBe(true);
    expect(() =>
      assertRolePermission(UserRole.PHD_STUDENT, PermissionAction.ADD_NEW_CHEMICAL)
    ).toThrow(/Permission Denied/);
    expect(() =>
      assertRolePermission(UserRole.PHD_STUDENT, PermissionAction.SUBMIT_STOCK_ADJUSTMENT)
    ).toThrow(/Permission Denied/);
  });

  it('10. Role-based notifications, Stock Rupture workflow, and duplicate notification prevention', () => {
    const sampleUsers: UserProfile[] = [
      {
        uid: 'u-director',
        fullName: 'Director',
        email: 'director@lcsco.dz',
        role: UserRole.ADMIN,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: '2026-10-06T08:00:00Z',
        lastLogin: '2026-10-06T08:00:00Z',
      },
      {
        uid: 'u-secretary',
        fullName: 'Secretary',
        email: 'secretary@lcsco.dz',
        role: UserRole.SECRETARY,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: '2026-10-06T08:00:00Z',
        lastLogin: '2026-10-06T08:00:00Z',
      },
      {
        uid: 'u-professor',
        fullName: 'Professor',
        email: 'professor@lcsco.dz',
        role: UserRole.PROFESSOR,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: '2026-10-06T08:00:00Z',
        lastLogin: '2026-10-06T08:00:00Z',
      },
      {
        uid: 'u-technician',
        fullName: 'Technician',
        email: 'technician@lcsco.dz',
        role: UserRole.TECHNICIAN,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: '2026-10-06T08:00:00Z',
        lastLogin: '2026-10-06T08:00:00Z',
      },
      {
        uid: 'u-phd-1',
        fullName: 'PhD Student A',
        email: 'phd1@lcsco.dz',
        role: UserRole.PHD_STUDENT,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: '2026-10-06T08:00:00Z',
        lastLogin: '2026-10-06T08:00:00Z',
      },
      {
        uid: 'u-phd-2',
        fullName: 'PhD Student B',
        email: 'phd2@lcsco.dz',
        role: UserRole.PHD_STUDENT,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: '2026-10-06T08:00:00Z',
        lastLogin: '2026-10-06T08:00:00Z',
      },
    ];

    const bottle = createSampleContainer({
      containerId: 'SOL-099',
      currentQuantity: 500,
    });

    // 1. PhD Student A reports stock rupture -> notifies Director & Technician (and reporter tracking), NOT Professor or PhD Student B
    const firstReport = processStockRuptureReport({
      container: bottle,
      reporter: {
        uid: 'u-phd-1',
        fullName: 'PhD Student A',
        role: UserRole.PHD_STUDENT,
      },
      comment: 'Acetonitrile — stock rupture',
      priority: NotificationPriority.HIGH,
      existingRuptures: [],
      existingNotifications: [],
      allUsers: sampleUsers,
    });

    expect(firstReport.wasMergedDuplicate).toBe(false);
    expect(firstReport.ruptureRequest.status).toBe(StockRuptureStatus.REPORTED);
    expect(firstReport.ruptureRequest.reportCount).toBe(1);
    // Inventory quantity is NOT modified automatically
    expect(bottle.currentQuantity).toBe(500);

    const notifiedUserIds = firstReport.updatedNotifications.map((n) => n.recipientUserId);
    expect(notifiedUserIds).toContain('u-director');
    expect(notifiedUserIds).toContain('u-secretary');
    expect(notifiedUserIds).toContain('u-technician');
    expect(notifiedUserIds).not.toContain('u-professor');
    expect(notifiedUserIds).not.toContain('u-phd-2');

    // 2. PhD Student B reports the same chemical shortly after -> Duplicate prevention merges report & increments reportCount
    const secondReport = processStockRuptureReport({
      container: bottle,
      reporter: {
        uid: 'u-phd-2',
        fullName: 'PhD Student B',
        role: UserRole.PHD_STUDENT,
      },
      comment: 'Confirmed shelf is empty',
      priority: NotificationPriority.CRITICAL,
      existingRuptures: firstReport.updatedRuptures,
      existingNotifications: firstReport.updatedNotifications,
      allUsers: sampleUsers,
    });

    expect(secondReport.wasMergedDuplicate).toBe(true);
    expect(secondReport.updatedRuptures.length).toBe(1);
    expect(secondReport.ruptureRequest.reportCount).toBe(2);
    expect(secondReport.ruptureRequest.priority).toBe(NotificationPriority.CRITICAL);
    // Does not create duplicate notifications for Director or Technician
    const techNotifs = secondReport.updatedNotifications.filter(
      (n) => n.recipientUserId === 'u-technician'
    );
    expect(techNotifs.length).toBe(1);
    expect(techNotifs[0].reportCount).toBe(2);

    // 3. Marking notification as read keeps it in history
    const afterRead = markNotificationReadInList(
      secondReport.updatedNotifications,
      techNotifs[0].notificationId
    );
    expect(afterRead.length).toBe(secondReport.updatedNotifications.length);
    expect(
      afterRead.find((n) => n.notificationId === techNotifs[0].notificationId)?.isRead
    ).toBe(true);

    // 4. Technician transitions workflow: REPORTED -> UNDER_REVIEW -> CONFIRMED -> RESOLVED
    const underReview = transitionStockRuptureWorkflow({
      ruptureId: secondReport.ruptureRequest.ruptureId,
      nextStatus: StockRuptureStatus.UNDER_REVIEW,
      actor: { uid: 'u-technician', fullName: 'Technician', role: UserRole.TECHNICIAN },
      existingRuptures: secondReport.updatedRuptures,
      existingNotifications: afterRead,
      allUsers: sampleUsers,
    });
    expect(underReview.updatedRupture.status).toBe(StockRuptureStatus.UNDER_REVIEW);

    const confirmed = transitionStockRuptureWorkflow({
      ruptureId: secondReport.ruptureRequest.ruptureId,
      nextStatus: StockRuptureStatus.CONFIRMED,
      actor: { uid: 'u-technician', fullName: 'Technician', role: UserRole.TECHNICIAN },
      resolutionNote: 'Confirmed bottle empty during physical inspection',
      existingRuptures: underReview.updatedRuptures,
      existingNotifications: underReview.updatedNotifications,
      allUsers: sampleUsers,
    });
    expect(confirmed.updatedRupture.status).toBe(StockRuptureStatus.CONFIRMED);

    const resolved = transitionStockRuptureWorkflow({
      ruptureId: secondReport.ruptureRequest.ruptureId,
      nextStatus: StockRuptureStatus.RESOLVED,
      actor: { uid: 'u-technician', fullName: 'Technician', role: UserRole.TECHNICIAN },
      resolutionNote: 'Stock updated via normal adjustment workflow',
      existingRuptures: confirmed.updatedRuptures,
      existingNotifications: confirmed.updatedNotifications,
      allUsers: sampleUsers,
    });
    expect(resolved.updatedRupture.status).toBe(StockRuptureStatus.RESOLVED);
    expect(resolved.updatedRupture.resolvedByUid).toBe('u-technician');
  });
});
