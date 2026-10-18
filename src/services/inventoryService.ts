/**
 * Production Inventory Service (`inventoryService.ts`)
 * Implements atomic Firestore `runTransaction` workflows for stock withdrawals, additions,
 * inventory discrepancy corrections, identification/quarantine flagging, and catalog management.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import {
  INITIAL_PHYSICAL_LOCATIONS,
} from '../data/demoInventoryData';
import {
  AppNotification,
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  DisposalWorkflowItem,
  InventoryTransaction,
  LabFloorPlanConfig,
  Laboratory,
  OperationType,
  PhysicalLocationConfig,
  Product,
  PurchaseWorkflowItem,
  SCHEMA_CONSTRAINTS,
  StockAdjustmentRequest,
  StockRuptureRequest,
  StorageLocation,
  TransactionType,
  UserRole,
  UserStatus,
} from '../types/inventory';
import {
  assertRolePermission,
  buildStorageLocation,
  calculateAdditionMutation,
  calculateCorrectionMutation,
  calculateWithdrawalMutation,
  computeStockStatus,
  isValidEntityId,
  sanitizeId,
  toFirestoreLocationMap,
} from './inventoryDomain';
import { PermissionAction } from '../types/inventory';

export interface TransactionActor {
  uid: string;
  fullName: string;
  role: UserRole;
}

function generateTransactionId(prefix = 'TX'): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${randomSuffix}`;
}

/**
 * WORKFLOW A: Atomic Bench Withdrawal (`runTransaction`)
 * 1. Reads current container stock inside transaction
 * 2. Validates unit match, operational lock status, and requestedAmount <= currentQuantity
 * 3. Automatically computes NORMAL / LOW_STOCK / NEARLY_EMPTY status
 * 4. Updates container and appends immutable Transaction record atomically
 */
export async function withdrawChemicalStock(params: {
  containerId: string;
  amount: number;
  unit: ChemicalUnit;
  reason: string;
  actor: TransactionActor;
}): Promise<{ newQuantity: number; newStatus: ContainerStatus; transactionId: string }> {
  const { containerId, amount, unit, reason, actor } = params;
  assertRolePermission(actor.role, PermissionAction.RECORD_CONSUMPTION);
  if (!isValidEntityId(containerId)) {
    throw new Error('Invalid container ID format.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('WD');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const calc = calculateWithdrawalMutation(container, amount, unit, reason);

      transaction.update(containerRef, {
        currentQuantity: calc.quantityAfter,
        status: calc.newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.WITHDRAWAL,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: container.laboratoryId,
        containerId: container.containerId,
        productId: container.productId,
        quantityChange: calc.quantityChange,
        quantityBefore: calc.quantityBefore,
        quantityAfter: calc.quantityAfter,
        unit: container.unit,
        oldLocation: container.location.code,
        newLocation: container.location.code,
        oldStatus: calc.oldStatus,
        newStatus: calc.newStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return {
        newQuantity: calc.quantityAfter,
        newStatus: calc.newStatus,
        transactionId,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Negative Stock Error') ||
        error.message.includes('Unit Mismatch Error') ||
        error.message.includes('Container Locked Error') ||
        error.message.includes('Validation Error') ||
        error.message.includes('does not exist'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * Atomic Stock Addition (`runTransaction`)
 */
export async function addChemicalStock(params: {
  containerId: string;
  amount: number;
  unit: ChemicalUnit;
  reason: string;
  actor: TransactionActor;
}): Promise<{ newQuantity: number; newStatus: ContainerStatus; transactionId: string }> {
  const { containerId, amount, unit, reason, actor } = params;
  assertRolePermission(
    actor.role,
    PermissionAction.RECORD_STOCK_ADDITION,
    'Only the Director or Technician can record stock additions.'
  );
  if (!isValidEntityId(containerId)) {
    throw new Error('Invalid container ID format.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('ADD');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const calc = calculateAdditionMutation(container, amount, unit, reason);

      transaction.update(containerRef, {
        currentQuantity: calc.quantityAfter,
        status: calc.newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.ADDITION,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: container.laboratoryId,
        containerId: container.containerId,
        productId: container.productId,
        quantityChange: calc.quantityChange,
        quantityBefore: calc.quantityBefore,
        quantityAfter: calc.quantityAfter,
        unit: container.unit,
        oldLocation: container.location.code,
        newLocation: container.location.code,
        oldStatus: calc.oldStatus,
        newStatus: calc.newStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return {
        newQuantity: calc.quantityAfter,
        newStatus: calc.newStatus,
        transactionId,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Unit Mismatch Error') ||
        error.message.includes('Container Locked Error') ||
        error.message.includes('Validation Error') ||
        error.message.includes('does not exist'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * WORKFLOW B (Part 1): Flag Container for Identification Problem or Quarantine
 * Locks the container from routine withdrawals and places it on the Professor / Lab Director Dashboard.
 */
export async function flagContainerIssue(params: {
  containerId: string;
  targetStatus: ContainerStatus.NEEDS_IDENTIFICATION | ContainerStatus.QUARANTINED;
  reason: string;
  actor: TransactionActor;
}): Promise<{ transactionId: string }> {
  const { containerId, targetStatus, reason, actor } = params;
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Please describe the label/identification or contamination issue.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('FLG');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      if (container.status === ContainerStatus.DISPOSAL_REQUIRED) {
        throw new Error('Container Locked Error: Container is already marked for disposal.');
      }

      transaction.update(containerRef, {
        status: targetStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.STATUS_CHANGE,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: container.laboratoryId,
        containerId: container.containerId,
        productId: container.productId,
        quantityChange: 0,
        quantityBefore: container.currentQuantity,
        quantityAfter: container.currentQuantity,
        unit: container.unit,
        oldLocation: container.location.code,
        newLocation: container.location.code,
        oldStatus: container.status,
        newStatus: targetStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return { transactionId };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Validation Error') || error.message.includes('Container Locked Error'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * WORKFLOW B (Part 2): Professor / Lab Director Resolution of Flagged Container
 */
export async function resolveFlaggedContainer(params: {
  containerId: string;
  resolution: 'RESTORE' | 'DISPOSAL';
  reason: string;
  actor: TransactionActor;
}): Promise<{ newStatus: ContainerStatus; transactionId: string }> {
  const { containerId, resolution, reason, actor } = params;
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.PROFESSOR) {
    throw new Error('Permission Denied: Only a Lab Director or Professor can resolve identification/quarantine flags.');
  }
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Mandatory review note is required to resolve container status.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('RES');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const newStatus =
        resolution === 'DISPOSAL'
          ? ContainerStatus.DISPOSAL_REQUIRED
          : computeStockStatus(container.currentQuantity, container.initialQuantity);

      transaction.update(containerRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.STATUS_CHANGE,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: container.laboratoryId,
        containerId: container.containerId,
        productId: container.productId,
        quantityChange: 0,
        quantityBefore: container.currentQuantity,
        quantityAfter: container.currentQuantity,
        unit: container.unit,
        oldLocation: container.location.code,
        newLocation: container.location.code,
        oldStatus: container.status,
        newStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return { newStatus, transactionId };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Permission Denied') || error.message.includes('Validation Error'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * WORKFLOW C: Lab Engineer / Technician Inventory Check & Discrepancy Correction (`runTransaction`)
 */
export async function correctContainerInventory(params: {
  containerId: string;
  measuredQuantity: number;
  unit: ChemicalUnit;
  reason: string;
  actor: TransactionActor;
}): Promise<{ quantityBefore: number; quantityAfter: number; quantityChange: number; transactionId: string }> {
  const { containerId, measuredQuantity, unit, reason, actor } = params;
  if (
    actor.role !== UserRole.ADMIN &&
    actor.role !== UserRole.PROFESSOR &&
    actor.role !== UserRole.TECHNICIAN
  ) {
    throw new Error('Permission Denied: Only Lab Engineers/Technicians, Professors, or the Lab Director can log physical stock corrections.');
  }

  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('COR');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const calc = calculateCorrectionMutation(container, measuredQuantity, unit, reason);

      transaction.update(containerRef, {
        currentQuantity: calc.quantityAfter,
        status: calc.newStatus,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.CORRECTION,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: container.laboratoryId,
        containerId: container.containerId,
        productId: container.productId,
        quantityChange: calc.quantityChange,
        quantityBefore: calc.quantityBefore,
        quantityAfter: calc.quantityAfter,
        unit: container.unit,
        oldLocation: container.location.code,
        newLocation: container.location.code,
        oldStatus: calc.oldStatus,
        newStatus: calc.newStatus,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return {
        quantityBefore: calc.quantityBefore,
        quantityAfter: calc.quantityAfter,
        quantityChange: calc.quantityChange,
        transactionId,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Permission Denied') ||
        error.message.includes('Negative Stock Error') ||
        error.message.includes('Unit Mismatch Error') ||
        error.message.includes('Container Locked Error') ||
        error.message.includes('Validation Error'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

export const correctStockDiscrepancy = correctContainerInventory;

/**
 * Location Transfer (`runTransaction`)
 */
export async function transferContainerLocation(params: {
  containerId: string;
  newLocationInput: Omit<StorageLocation, 'code'> & { code?: string };
  newLaboratoryId?: string;
  newStorageCondition?: string;
  reason: string;
  actor: TransactionActor;
}): Promise<{ newLocationCode: string; transactionId: string }> {
  const { containerId, newLocationInput, newLaboratoryId, newStorageCondition, reason, actor } = params;
  assertRolePermission(
    actor.role,
    PermissionAction.MOVE_BETWEEN_LOCATIONS,
    'Only the Director or Technician can move chemicals between storage locations.'
  );
  if (!reason || reason.trim().length === 0) {
    throw new Error('Validation Error: Reason is required for location transfer.');
  }

  const validatedLocation = buildStorageLocation(newLocationInput);
  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('TRF');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    return await runTransaction(db, async (transaction) => {
      const containerSnap = await transaction.get(containerRef);
      if (!containerSnap.exists()) {
        throw new Error(`Container ${containerId} does not exist.`);
      }

      const container = containerSnap.data() as ChemicalContainer;
      const targetLabId = newLaboratoryId ? sanitizeId(newLaboratoryId) : container.laboratoryId;
      const targetCondition = newStorageCondition
        ? newStorageCondition.trim().slice(0, SCHEMA_CONSTRAINTS.STORAGE_REQ_MAX_LENGTH)
        : container.storageCondition;

      transaction.update(containerRef, {
        location: toFirestoreLocationMap(validatedLocation),
        laboratoryId: targetLabId,
        storageCondition: targetCondition,
        updatedAt: serverTimestamp(),
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.TRANSFER,
        timestamp: serverTimestamp(),
        userId: actor.uid,
        userName: actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: targetLabId,
        containerId: container.containerId,
        productId: container.productId,
        quantityChange: 0,
        quantityBefore: container.currentQuantity,
        quantityAfter: container.currentQuantity,
        unit: container.unit,
        oldLocation: container.location.code,
        newLocation: validatedLocation.code,
        oldStatus: container.status,
        newStatus: container.status,
        reason: reason.trim().slice(0, SCHEMA_CONSTRAINTS.REASON_MAX_LENGTH),
      });

      return { newLocationCode: validatedLocation.code, transactionId };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Permission Denied') || error.message.includes('Validation Error'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `containers/${containerId}`);
  }
}

/**
 * Create a new Catalog Product
 */
export async function createProductCatalogItem(input: {
  productId?: string;
  chemicalName: string;
  casNumber: string;
  formula: string;
  molecularWeight: number;
  hazardClass: string[];
  storageRequirements: string;
  defaultUnit: ChemicalUnit;
  minimumStock: number;
  reorderLevel: number;
  sdsUrl: string;
}): Promise<string> {
  const productId = input.productId
    ? sanitizeId(input.productId)
    : `PROD-${Date.now().toString(36).toUpperCase()}`;

  const payload = {
    productId,
    chemicalName: input.chemicalName.trim().slice(0, SCHEMA_CONSTRAINTS.CHEMICAL_NAME_MAX_LENGTH),
    casNumber: input.casNumber.trim().slice(0, SCHEMA_CONSTRAINTS.CAS_MAX_LENGTH),
    formula: input.formula.trim().slice(0, SCHEMA_CONSTRAINTS.FORMULA_MAX_LENGTH),
    molecularWeight: Math.max(0, Number(input.molecularWeight) || 0),
    hazardClass: input.hazardClass
      .map((h) => h.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, SCHEMA_CONSTRAINTS.MAX_HAZARD_CLASSES),
    storageRequirements: input.storageRequirements.trim().slice(0, SCHEMA_CONSTRAINTS.STORAGE_REQ_MAX_LENGTH),
    defaultUnit: input.defaultUnit,
    minimumStock: Math.max(0, Number(input.minimumStock) || 0),
    reorderLevel: Math.max(0, Number(input.reorderLevel) || 0),
    sdsUrl: (input.sdsUrl || 'https://pubchem.ncbi.nlm.nih.gov').trim().slice(0, SCHEMA_CONSTRAINTS.SDS_URL_MAX_LENGTH),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'products', productId), payload);
    return productId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `products/${productId}`);
  }
}

/**
 * Register a new Physical Container (`runTransaction`)
 */
export async function createChemicalContainer(input: {
  containerId: string;
  productId: string;
  laboratoryId: string;
  initialQuantity: number;
  currentQuantity?: number;
  unit: ChemicalUnit;
  location: Omit<StorageLocation, 'code'> & { code?: string };
  storageCondition: string;
  lotNumber: string;
  supplier: string;
  expiryDate: string;
  actor: TransactionActor;
}): Promise<string> {
  const containerId = sanitizeId(input.containerId.toUpperCase());
  if (!isValidEntityId(containerId)) {
    throw new Error('Validation Error: Container ID must use alphanumeric characters or hyphens (e.g., SOL-001).');
  }

  const initialQty = Number(input.initialQuantity);
  const currentQty = input.currentQuantity !== undefined ? Number(input.currentQuantity) : initialQty;
  if (initialQty <= 0 || currentQty < 0) {
    throw new Error('Validation Error: Initial quantity must be > 0 and current quantity >= 0.');
  }

  const validatedLocation = buildStorageLocation(input.location);
  const computedStatus = computeStockStatus(currentQty, initialQty);
  const containerRef = doc(db, 'containers', containerId);
  const transactionId = generateTransactionId('REG');
  const transactionRef = doc(db, 'transactions', transactionId);

  try {
    await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(containerRef);
      if (existingSnap.exists()) {
        throw new Error(`Duplicate Container ID: A container with ID "${containerId}" already exists.`);
      }

      transaction.set(containerRef, {
        containerId,
        productId: sanitizeId(input.productId),
        laboratoryId: sanitizeId(input.laboratoryId),
        initialQuantity: initialQty,
        currentQuantity: currentQty,
        unit: input.unit,
        location: toFirestoreLocationMap(validatedLocation),
        storageCondition: input.storageCondition.trim().slice(0, SCHEMA_CONSTRAINTS.STORAGE_REQ_MAX_LENGTH),
        status: computedStatus,
        lotNumber: input.lotNumber.trim().slice(0, SCHEMA_CONSTRAINTS.LOT_NUMBER_MAX_LENGTH),
        supplier: input.supplier.trim().slice(0, SCHEMA_CONSTRAINTS.SUPPLIER_MAX_LENGTH),
        expiryDate: input.expiryDate.trim().slice(0, SCHEMA_CONSTRAINTS.EXPIRY_DATE_MAX_LENGTH),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: input.actor.uid,
      });

      transaction.set(transactionRef, {
        transactionId,
        type: TransactionType.ADDITION,
        timestamp: serverTimestamp(),
        userId: input.actor.uid,
        userName: input.actor.fullName.slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
        laboratoryId: sanitizeId(input.laboratoryId),
        containerId,
        productId: sanitizeId(input.productId),
        quantityChange: currentQty,
        quantityBefore: 0,
        quantityAfter: currentQty,
        unit: input.unit,
        oldLocation: validatedLocation.code,
        newLocation: validatedLocation.code,
        oldStatus: computedStatus,
        newStatus: computedStatus,
        reason: `Initial container registration (Lot: ${input.lotNumber.trim()})`,
      });
    });

    return containerId;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Duplicate Container ID') || error.message.includes('Validation Error'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `containers/${containerId}`);
  }
}

/**
 * Archive / Permanently Delete Physical Container (Strictly Restricted to DIRECTOR ONLY)
 * Professors, Technicians, and PhD Students are explicitly blocked from permanently deleting inventory records.
 */
export async function deleteChemicalContainer(params: {
  containerId: string;
  actor: TransactionActor;
}): Promise<void> {
  const { containerId, actor } = params;
  assertRolePermission(
    actor.role,
    PermissionAction.ARCHIVE_REMOVE_CHEMICAL,
    'Only the Director can archive or permanently remove chemical records.'
  );
  try {
    await deleteDoc(doc(db, 'containers', containerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `containers/${containerId}`);
  }
}

/**
 * Create a new Laboratory
 */
export async function createLaboratory(input: { labId: string; name: string }): Promise<string> {
  const labId = sanitizeId(input.labId.toUpperCase());
  const name = input.name.trim().slice(0, SCHEMA_CONSTRAINTS.LAB_NAME_MAX_LENGTH);
  if (!isValidEntityId(labId) || !name) {
    throw new Error('Validation Error: Valid Lab ID and Name are required.');
  }

  try {
    await setDoc(doc(db, 'laboratories', labId), {
      labId,
      name,
      createdAt: serverTimestamp(),
    });
    return labId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `laboratories/${labId}`);
  }
}

/**
 * Lab Director ONLY: Provision a new Researcher Profile in Firestore
 */
export async function createLabMemberProfile(input: {
  uid?: string;
  fullName: string;
  email: string;
  role: UserRole;
  laboratoryIds: string[];
  status?: UserStatus;
  actor: TransactionActor;
}): Promise<string> {
  if (input.actor.role !== UserRole.ADMIN) {
    throw new Error('Permission Denied: Only the Director profile has access to add or remove profiles.');
  }

  const uid = input.uid
    ? sanitizeId(input.uid)
    : `LCSCO-${Date.now().toString(36).toUpperCase()}`;

  const payload: any = {
    uid,
    fullName: input.fullName.trim().slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
    email: input.email.trim().slice(0, SCHEMA_CONSTRAINTS.EMAIL_MAX_LENGTH),
    role: input.role,
    laboratoryIds: input.laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
    status: input.status || UserStatus.ACTIVE,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid), payload);
    return uid;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
  }
}

/**
 * Lab Director ONLY: Remove a Researcher Profile from Firestore
 */
export async function deleteLabMemberProfile(params: {
  targetUid: string;
  actor: TransactionActor;
}): Promise<void> {
  if (params.actor.role !== UserRole.ADMIN) {
    throw new Error('Permission Denied: Only the Director profile has access to add or remove profiles.');
  }
  try {
    await deleteDoc(doc(db, 'users', params.targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${params.targetUid}`);
  }
}

/**
 * Update own profile details (Full Name & Assigned LCSCO Research Teams)
 */
export async function updateOwnUserProfile(params: {
  uid: string;
  fullName: string;
  laboratoryIds: string[];
}): Promise<void> {
  const { uid, fullName, laboratoryIds } = params;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fullName: fullName.trim().slice(0, SCHEMA_CONSTRAINTS.FULL_NAME_MAX_LENGTH),
      laboratoryIds: laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
      lastLogin: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

/**
 * Lab Director / Professor: Update a user's Role, Status, or Laboratory assignments
 */
export async function updateUserPermissions(params: {
  targetUid: string;
  role: UserRole;
  status: UserStatus;
  laboratoryIds: string[];
}): Promise<void> {
  const { targetUid, role, status, laboratoryIds } = params;
  try {
    const userRef = doc(db, 'users', targetUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: targetUid,
        fullName: targetUid,
        email: `${targetUid.toLowerCase()}@lcsco.dz`,
        role,
        status,
        laboratoryIds: laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        role,
        status,
        laboratoryIds: laboratoryIds.slice(0, SCHEMA_CONSTRAINTS.MAX_LAB_IDS),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function clearAllFirestoreInventory(): Promise<void> {
  try {
    const containersSnap = await getDocs(collection(db, 'containers'));
    for (const d of containersSnap.docs) {
      await deleteDoc(doc(db, 'containers', d.id));
    }
    const productsSnap = await getDocs(collection(db, 'products'));
    for (const d of productsSnap.docs) {
      await deleteDoc(doc(db, 'products', d.id));
    }
  } catch {
    // Ignore permission errors if non-admin
  }
}

/**
 * Persists a physical storage location (Cabinet layout) in Firestore
 */
export async function saveFirestorePhysicalLocation(config: PhysicalLocationConfig): Promise<void> {
  try {
    const locRef = doc(db, 'physicalLocations', config.id);
    await setDoc(locRef, {
      id: config.id,
      room: config.room,
      cabinet: config.cabinet,
      cabinetLabel: config.cabinetLabel || config.cabinet,
      storageClassification: config.storageClassification || 'General storage',
      sides: config.sides || ['Left', 'Right'],
      shelves: config.shelves || ['1', '2', '3', '4'],
      positions: config.positions || ['01', '02', '03', '04', '05'],
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `physicalLocations/${config.id}`);
  }
}

/**
 * Deletes a physical storage location from Firestore
 */
export async function deleteFirestorePhysicalLocation(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'physicalLocations', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `physicalLocations/${id}`);
  }
}

/**
 * Seeds initial physical cabinets in Firestore if empty
 */
export async function seedInitialPhysicalLocations(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'physicalLocations'));
    const existingLocIds = new Set(snap.docs.map((d) => d.id));
    for (const loc of INITIAL_PHYSICAL_LOCATIONS) {
      if (!existingLocIds.has(loc.id)) {
        await setDoc(doc(db, 'physicalLocations', loc.id), {
          id: loc.id,
          room: loc.room,
          cabinet: loc.cabinet,
          cabinetLabel: loc.cabinetLabel,
          storageClassification: loc.storageClassification,
          sides: loc.sides,
          shelves: loc.shelves,
          positions: loc.positions,
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'physicalLocations');
  }
}

/**
 * Persists a stock adjustment request to Firestore
 */
export async function saveFirestoreAdjustmentRequest(req: StockAdjustmentRequest): Promise<void> {
  try {
    const payload: any = {
      requestId: req.requestId,
      containerId: req.containerId,
      productId: req.productId,
      chemicalName: req.chemicalName,
      laboratoryId: req.laboratoryId,
      previousQuantity: req.previousQuantity,
      newQuantity: req.newQuantity,
      difference: req.difference,
      unit: req.unit,
      adjustmentType: req.adjustmentType || 'Correction of entry error',
      reason: req.reason,
      requestedByUid: req.requestedByUid,
      requestedByName: req.requestedByName,
      requestedByRole: req.requestedByRole,
      requestedAt: req.requestedAt,
      status: req.status,
    };
    if (req.approverUid) payload.approverUid = req.approverUid;
    if (req.approverName) payload.approverName = req.approverName;
    if (req.approverRole) payload.approverRole = req.approverRole;
    if (req.approvedAt) payload.approvedAt = req.approvedAt;

    await setDoc(doc(db, 'adjustmentRequests', req.requestId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `adjustmentRequests/${req.requestId}`);
  }
}

/**
 * Updates a stock adjustment request in Firestore
 */
export async function updateFirestoreAdjustmentRequest(
  requestId: string,
  updates: Partial<StockAdjustmentRequest>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'adjustmentRequests', requestId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `adjustmentRequests/${requestId}`);
  }
}

/**
 * Persists a chemical disposal request in Firestore
 */
export async function saveFirestoreDisposalRequest(req: DisposalWorkflowItem): Promise<void> {
  try {
    const payload: any = {
      disposalId: req.disposalId,
      containerId: req.containerId,
      productId: req.productId,
      chemicalName: req.chemicalName,
      quantity: req.quantity,
      unit: req.unit,
      locationCode: req.locationCode,
      laboratoryId: req.laboratoryId,
      reason: req.reason,
      requestedByUid: req.requestedByUid,
      requestedByName: req.requestedByName,
      requestedByRole: req.requestedByRole,
      requestedAt: req.requestedAt,
      status: req.status,
    };
    if (req.approvedByUid) payload.approvedByUid = req.approvedByUid;
    if (req.approvedByName) payload.approvedByName = req.approvedByName;
    if (req.approvedByRole) payload.approvedByRole = req.approvedByRole;
    if (req.approvedAt) payload.approvedAt = req.approvedAt;
    if (req.disposedByUid) payload.disposedByUid = req.disposedByUid;
    if (req.disposedByName) payload.disposedByName = req.disposedByName;
    if (req.disposedAt) payload.disposedAt = req.disposedAt;
    if (req.wasteManifestCode) payload.wasteManifestCode = req.wasteManifestCode;

    await setDoc(doc(db, 'disposalRequests', req.disposalId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `disposalRequests/${req.disposalId}`);
  }
}

/**
 * Updates a chemical disposal request in Firestore
 */
export async function updateFirestoreDisposalRequest(
  disposalId: string,
  updates: Partial<DisposalWorkflowItem>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'disposalRequests', disposalId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `disposalRequests/${disposalId}`);
  }
}

/**
 * Persists a purchase workflow item in Firestore
 */
export async function saveFirestorePurchaseRequest(req: PurchaseWorkflowItem): Promise<void> {
  try {
    const payload: any = {
      purchaseId: req.purchaseId,
      chemicalName: req.chemicalName,
      casNumber: req.casNumber || 'N/A',
      formula: req.formula || '—',
      requestedQuantity: req.requestedQuantity,
      unit: req.unit,
      supplier: req.supplier || 'Sigma-Aldrich',
      laboratoryId: req.laboratoryId,
      reason: req.reason,
      requestedByUid: req.requestedByUid,
      requestedByName: req.requestedByName,
      requestedByRole: req.requestedByRole,
      requestedAt: req.requestedAt,
      status: req.status,
    };
    if (req.approvedByUid) payload.approvedByUid = req.approvedByUid;
    if (req.approvedByName) payload.approvedByName = req.approvedByName;
    if (req.approvedByRole) payload.approvedByRole = req.approvedByRole;
    if (req.approvedAt) payload.approvedAt = req.approvedAt;
    if (req.orderedAt) payload.orderedAt = req.orderedAt;
    if (req.receivedByUid) payload.receivedByUid = req.receivedByUid;
    if (req.receivedByName) payload.receivedByName = req.receivedByName;
    if (req.receivedAt) payload.receivedAt = req.receivedAt;
    if (req.receivedContainerId) payload.receivedContainerId = req.receivedContainerId;
    if (req.targetPlacementBox) payload.targetPlacementBox = req.targetPlacementBox;

    await setDoc(doc(db, 'purchaseRequests', req.purchaseId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `purchaseRequests/${req.purchaseId}`);
  }
}

/**
 * Updates a purchase workflow item in Firestore
 */
export async function updateFirestorePurchaseRequest(
  purchaseId: string,
  updates: Partial<PurchaseWorkflowItem>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'purchaseRequests', purchaseId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `purchaseRequests/${purchaseId}`);
  }
}

/**
 * Persists a stock rupture incident report in Firestore
 */
export async function saveFirestoreStockRupture(req: StockRuptureRequest): Promise<void> {
  try {
    const payload: any = {
      ruptureId: req.ruptureId,
      containerId: req.containerId,
      productId: req.productId,
      chemicalName: req.chemicalName,
      casNumber: req.casNumber || 'N/A',
      formula: req.formula || '—',
      laboratoryId: req.laboratoryId,
      locationCode: req.locationCode,
      currentInventoryQuantity: req.currentInventoryQuantity,
      unit: req.unit,
      currentInventoryStatus: req.currentInventoryStatus,
      reportedByUid: req.reportedByUid,
      reportedByName: req.reportedByName,
      reportedByRole: req.reportedByRole,
      reportedAt: req.reportedAt,
      priority: req.priority,
      status: req.status,
      reportCount: req.reportCount || 1,
      reporters: req.reporters || [],
    };
    if (req.comment) payload.comment = req.comment;
    if (req.reviewedByUid) payload.reviewedByUid = req.reviewedByUid;
    if (req.reviewedByName) payload.reviewedByName = req.reviewedByName;
    if (req.reviewedByRole) payload.reviewedByRole = req.reviewedByRole;
    if (req.reviewedAt) payload.reviewedAt = req.reviewedAt;
    if (req.resolutionNote) payload.resolutionNote = req.resolutionNote;
    if (req.resolvedByUid) payload.resolvedByUid = req.resolvedByUid;
    if (req.resolvedByName) payload.resolvedByName = req.resolvedByName;
    if (req.resolvedAt) payload.resolvedAt = req.resolvedAt;

    await setDoc(doc(db, 'stockRuptureRequests', req.ruptureId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `stockRuptureRequests/${req.ruptureId}`);
  }
}

/**
 * Updates a stock rupture incident report in Firestore
 */
export async function updateFirestoreStockRupture(
  ruptureId: string,
  updates: Partial<StockRuptureRequest>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'stockRuptureRequests', ruptureId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `stockRuptureRequests/${ruptureId}`);
  }
}

/**
 * Batched persistence of role notifications to Firestore
 */
export async function saveFirestoreNotifications(notifs: AppNotification[]): Promise<void> {
  if (!notifs || notifs.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const n of notifs) {
      const ref = doc(db, 'notifications', n.notificationId);
      const payload: any = {
        notificationId: n.notificationId,
        type: n.type,
        title: n.title,
        message: n.message,
        priority: n.priority,
        recipientUserId: n.recipientUserId,
        createdByUserId: n.createdByUserId,
        createdAt: n.createdAt,
        isRead: Boolean(n.isRead),
        isResolved: Boolean(n.isResolved),
      };
      if (n.recipientRole) payload.recipientRole = n.recipientRole;
      if (n.relatedContainerId) payload.relatedContainerId = n.relatedContainerId;
      if (n.relatedProductId) payload.relatedProductId = n.relatedProductId;
      if (n.relatedChemicalName) payload.relatedChemicalName = n.relatedChemicalName;
      if (n.relatedRequestId) payload.relatedRequestId = n.relatedRequestId;
      if (n.createdByName) payload.createdByName = n.createdByName;
      if (n.reportCount) payload.reportCount = n.reportCount;
      batch.set(ref, payload);
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'notifications');
  }
}

/**
 * Marks a notification as read in Firestore
 */
export async function markFirestoreNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      isRead: true,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

/**
 * Marks all notifications for a specific user as read in Firestore
 */
export async function markAllFirestoreNotificationsRead(userId: string): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('recipientUserId', '==', userId), where('isRead', '==', false))
    );
    if (!snap.empty) {
      const batch = writeBatch(db);
      for (const d of snap.docs) {
        batch.update(d.ref, { isRead: true, readAt: new Date().toISOString() });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

/**
 * Saves lab floor plan configuration in Firestore
 */
export async function saveFirestoreFloorPlanConfig(config: LabFloorPlanConfig): Promise<void> {
  try {
    await setDoc(doc(db, 'systemSettings', 'floorPlan'), {
      settingId: 'floorPlan',
      ...config,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'systemSettings/floorPlan');
  }
}

/**
 * Atomically updates a Container and Product record in Firestore, recording audit transaction
 */
export async function updateContainerAndProductInFirestore(params: {
  product: Product;
  container: ChemicalContainer;
  transaction: InventoryTransaction;
}): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'products', params.product.productId), {
      productId: params.product.productId,
      chemicalName: params.product.chemicalName,
      casNumber: params.product.casNumber,
      formula: params.product.formula,
      molecularWeight: params.product.molecularWeight,
      hazardClass: params.product.hazardClass,
      storageRequirements: params.product.storageRequirements,
      defaultUnit: params.product.defaultUnit,
      minimumStock: params.product.minimumStock,
      reorderLevel: params.product.reorderLevel,
      sdsUrl: params.product.sdsUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      chemicalClassification: params.product.chemicalClassification || 'Other',
      storageClassification: params.product.storageClassification || 'General storage',
    });

    batch.set(doc(db, 'containers', params.container.containerId), {
      containerId: params.container.containerId,
      productId: params.container.productId,
      laboratoryId: params.container.laboratoryId,
      initialQuantity: params.container.initialQuantity,
      currentQuantity: params.container.currentQuantity,
      unit: params.container.unit,
      location: toFirestoreLocationMap(params.container.location),
      storageCondition: params.container.storageCondition,
      status: params.container.status,
      lotNumber: params.container.lotNumber,
      supplier: params.container.supplier,
      expiryDate: params.container.expiryDate,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: params.container.createdBy,
      chemicalClassification: params.container.chemicalClassification || 'Other',
      storageClassification: params.container.storageClassification || 'General storage',
    });

    batch.set(doc(db, 'transactions', params.transaction.transactionId), {
      transactionId: params.transaction.transactionId,
      type: params.transaction.type,
      timestamp: serverTimestamp(),
      userId: params.transaction.userId,
      userName: params.transaction.userName,
      laboratoryId: params.transaction.laboratoryId,
      containerId: params.transaction.containerId,
      productId: params.transaction.productId,
      quantityChange: params.transaction.quantityChange,
      quantityBefore: params.transaction.quantityBefore,
      quantityAfter: params.transaction.quantityAfter,
      unit: params.transaction.unit,
      oldLocation: params.transaction.oldLocation,
      newLocation: params.transaction.newLocation,
      oldStatus: params.transaction.oldStatus,
      newStatus: params.transaction.newStatus,
      reason: params.transaction.reason,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `containers/${params.container.containerId}`);
  }
}
