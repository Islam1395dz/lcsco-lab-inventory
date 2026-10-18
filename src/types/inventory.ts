/**
 * Complete Type Definitions & Schema Constraints
 * Synchronized verbatim with `firebase-blueprint.json` and `firestore.rules`.
 */

import { Timestamp } from 'firebase/firestore';

export enum UserRole {
  ADMIN = 'ADMIN', // 1. DIRECTOR — Full Administrator
  PROFESSOR = 'PROFESSOR', // 2. PROFESSOR — Supervisor / Research Group Manager
  TECHNICIAN = 'TECHNICIAN', // 3. LAB ENGINEER — Operational Inventory Manager
  STUDENT_RESEARCHER = 'STUDENT_RESEARCHER', // 4. PHD STUDENT — Researcher / Inventory User
  PHD_STUDENT = 'STUDENT_RESEARCHER', // Alias for PHD STUDENT
  GUEST = 'GUEST',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  DEACTIVATED = 'DEACTIVATED',
}

export enum ChemicalUnit {
  GRAM = 'g',
  KILOGRAM = 'kg',
  MILLIGRAM = 'mg',
  MILLILITER = 'mL',
  LITER = 'L',
}

export enum ContainerStatus {
  NORMAL = 'NORMAL',
  LOW_STOCK = 'LOW_STOCK',
  NEARLY_EMPTY = 'NEARLY_EMPTY',
  NEEDS_IDENTIFICATION = 'NEEDS_IDENTIFICATION',
  QUARANTINED = 'QUARANTINED',
  DISPOSAL_REQUIRED = 'DISPOSAL_REQUIRED',
  EXPIRED = 'EXPIRED',
}

export enum TransactionType {
  WITHDRAWAL = 'WITHDRAWAL',
  ADDITION = 'ADDITION',
  TRANSFER = 'TRANSFER',
  STATUS_CHANGE = 'STATUS_CHANGE',
  CORRECTION = 'CORRECTION',
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * 24 Major Chemical / Storage Groups for Demo & Real Inventory Filtering
 */
export const CHEMICAL_CLASSIFICATIONS = [
  'Salts',
  'Acids',
  'Bases',
  'Aldehydes',
  'Ketones',
  'Alcohols',
  'Amines',
  'Amides',
  'Esters',
  'Ethers',
  'Carboxylic acids',
  'Halogenated compounds',
  'Hydrocarbons',
  'Aromatic compounds',
  'Heterocyclic compounds',
  'Heterocycles',
  'Organometallic compounds',
  'Metals',
  'Inorganics',
  'Phosphorus compounds',
  'Sulfur compounds',
  'Oxidizing agents',
  'Reducing agents',
  'Solvents',
  'Buffers',
  'Indicators / dyes',
  'Indicators',
  'Polymers',
  'Surfactants',
  'Other',
] as const;

export type ChemicalClassification = (typeof CHEMICAL_CLASSIFICATIONS)[number];

export const STORAGE_CLASSIFICATIONS = [
  'Flammable solvent',
  'Halogenated solvent',
  'Corrosive acid',
  'Corrosive base',
  'Dry desiccator (N2)',
  'Inert Argon Glovebox',
  'Oxidizer cabinet',
  'Refrigerated (+4°C / -20°C)',
  'General synthesis cabinet',
  'General storage',
] as const;

export type StorageClassification = (typeof STORAGE_CLASSIFICATIONS)[number];

export const STOCK_ADJUSTMENT_REASONS = [
  'New delivery',
  'Physical inventory count',
  'Correction of entry error',
  'Loss / spillage / evaporation',
  'Transfer between containers',
  'Other',
] as const;

export type StockAdjustmentReasonType = (typeof STOCK_ADJUSTMENT_REASONS)[number];

/**
 * Granular Permission Matrix for the 4 Laboratory Roles:
 * 1. DIRECTOR (ADMIN) — Full Administrator
 * 2. PROFESSOR — Supervisor / Research Group Manager
 * 3. LAB ENGINEER (TECHNICIAN) — Operational Inventory Manager
 * 4. PHD STUDENT (STUDENT_RESEARCHER) — Researcher / Inventory User
 */
export enum PermissionAction {
  VIEW_INVENTORY = 'VIEW_INVENTORY',
  SEARCH_AND_FILTER = 'SEARCH_AND_FILTER',
  VIEW_CHEMICAL_DETAILS_AND_SDS = 'VIEW_CHEMICAL_DETAILS_AND_SDS',
  ADD_NEW_CHEMICAL = 'ADD_NEW_CHEMICAL',
  EDIT_CHEMICAL_INFO = 'EDIT_CHEMICAL_INFO',
  ARCHIVE_REMOVE_CHEMICAL = 'ARCHIVE_REMOVE_CHEMICAL',
  MANAGE_STORAGE_LOCATIONS = 'MANAGE_STORAGE_LOCATIONS',
  RECORD_CONSUMPTION = 'RECORD_CONSUMPTION',
  RECORD_STOCK_ADDITION = 'RECORD_STOCK_ADDITION',
  MOVE_BETWEEN_LOCATIONS = 'MOVE_BETWEEN_LOCATIONS',
  SUBMIT_STOCK_ADJUSTMENT = 'SUBMIT_STOCK_ADJUSTMENT',
  APPROVE_STOCK_ADJUSTMENT = 'APPROVE_STOCK_ADJUSTMENT',
  CREATE_DISPOSAL_REQUEST = 'CREATE_DISPOSAL_REQUEST',
  APPROVE_DISPOSAL_REQUEST = 'APPROVE_DISPOSAL_REQUEST',
  RECORD_APPROVED_DISPOSAL = 'RECORD_APPROVED_DISPOSAL',
  CREATE_PURCHASE_REQUEST = 'CREATE_PURCHASE_REQUEST',
  APPROVE_PURCHASE_REQUEST = 'APPROVE_PURCHASE_REQUEST',
  RECEIVE_VALIDATED_DELIVERY = 'RECEIVE_VALIDATED_DELIVERY',
  REPORT_DAMAGED_OR_EXPIRED = 'REPORT_DAMAGED_OR_EXPIRED',
  REPORT_STOCK_RUPTURE = 'REPORT_STOCK_RUPTURE',
  REVIEW_STOCK_RUPTURE = 'REVIEW_STOCK_RUPTURE',
  MANAGE_USERS = 'MANAGE_USERS',
  EXPORT_REPORTS = 'EXPORT_REPORTS',
  ACCESS_SYSTEM_SETTINGS = 'ACCESS_SYSTEM_SETTINGS',
}

export enum NotificationType {
  STOCK_RUPTURE = 'STOCK_RUPTURE',
  LOW_STOCK = 'LOW_STOCK',
  EXPIRING_SOON = 'EXPIRING_SOON',
  EXPIRED_CHEMICAL = 'EXPIRED_CHEMICAL',
  PURCHASE_REQUEST = 'PURCHASE_REQUEST',
  PURCHASE_APPROVED = 'PURCHASE_APPROVED',
  PURCHASE_RECEIVED = 'PURCHASE_RECEIVED',
  DISPOSAL_REQUEST = 'DISPOSAL_REQUEST',
  STOCK_ADJUSTMENT_REQUEST = 'STOCK_ADJUSTMENT_REQUEST',
  SYSTEM_NOTIFICATION = 'SYSTEM_NOTIFICATION',
}

export enum NotificationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum StockRuptureStatus {
  REPORTED = 'REPORTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  CONFIRMED = 'CONFIRMED',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

export interface StockRuptureReportEntry {
  reporterUid: string;
  reporterName: string;
  reporterRole: UserRole;
  reportedAt: string;
  comment?: string;
}

export interface StockRuptureRequest {
  ruptureId: string;
  containerId: string;
  productId: string;
  chemicalName: string;
  casNumber: string;
  formula: string;
  laboratoryId: string;
  locationCode: string;
  currentInventoryQuantity: number;
  unit: ChemicalUnit;
  currentInventoryStatus: ContainerStatus;
  reportedByUid: string;
  reportedByName: string;
  reportedByRole: UserRole;
  reportedAt: string;
  comment?: string;
  priority: NotificationPriority;
  status: StockRuptureStatus;
  reportCount: number;
  reporters: StockRuptureReportEntry[];
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedByRole?: UserRole;
  reviewedAt?: string;
  resolutionNote?: string;
  resolvedByUid?: string;
  resolvedByName?: string;
  resolvedAt?: string;
}

export interface AppNotification {
  notificationId: string;
  type: NotificationType | string;
  title: string;
  message: string;
  priority: NotificationPriority;
  recipientUserId: string;
  recipientRole?: UserRole;
  relatedContainerId?: string;
  relatedProductId?: string;
  relatedChemicalName?: string;
  relatedRequestId?: string;
  createdByUserId: string;
  createdByName?: string;
  createdAt: string;
  isRead: boolean;
  readAt?: string;
  isResolved: boolean;
  resolvedAt?: string;
  resolverUserId?: string;
  resolverName?: string;
  reportCount?: number;
}

export interface StockAdjustmentRequest {
  requestId: string;
  containerId: string;
  productId: string;
  chemicalName: string;
  laboratoryId: string;
  previousQuantity: number;
  newQuantity: number;
  difference: number;
  unit: ChemicalUnit;
  adjustmentType?: StockAdjustmentReasonType;
  reason: string;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: UserRole;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approverUid?: string;
  approverName?: string;
  approverRole?: UserRole;
  approvedAt?: string;
}

export interface DisposalWorkflowItem {
  disposalId: string;
  containerId: string;
  productId: string;
  chemicalName: string;
  quantity: number;
  unit: ChemicalUnit;
  locationCode: string;
  laboratoryId: string;
  reason: string;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: UserRole;
  requestedAt: string;
  status: 'REQUESTED' | 'APPROVED' | 'DISPOSED' | 'REJECTED';
  approvedByUid?: string;
  approvedByName?: string;
  approvedByRole?: UserRole;
  approvedAt?: string;
  disposedByUid?: string;
  disposedByName?: string;
  disposedAt?: string;
  wasteManifestCode?: string;
}

export interface PurchaseWorkflowItem {
  purchaseId: string;
  chemicalName: string;
  casNumber: string;
  formula: string;
  requestedQuantity: number;
  unit: ChemicalUnit;
  supplier: string;
  laboratoryId: string;
  reason: string;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: UserRole;
  requestedAt: string;
  status: 'REQUESTED' | 'APPROVED' | 'ORDERED' | 'RECEIVED';
  approvedByUid?: string;
  approvedByName?: string;
  approvedByRole?: UserRole;
  approvedAt?: string;
  orderedAt?: string;
  receivedByUid?: string;
  receivedByName?: string;
  receivedAt?: string;
  receivedContainerId?: string;
  targetPlacementBox?: string;
}

export const SCHEMA_CONSTRAINTS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  ID_MAX_LENGTH: 128,
  FULL_NAME_MAX_LENGTH: 120,
  EMAIL_MAX_LENGTH: 254,
  LAB_NAME_MAX_LENGTH: 150,
  CHEMICAL_NAME_MAX_LENGTH: 200,
  CAS_MAX_LENGTH: 32,
  FORMULA_MAX_LENGTH: 64,
  STORAGE_REQ_MAX_LENGTH: 200,
  SDS_URL_MAX_LENGTH: 500,
  LOT_NUMBER_MAX_LENGTH: 80,
  SUPPLIER_MAX_LENGTH: 120,
  EXPIRY_DATE_MAX_LENGTH: 40,
  LOCATION_FIELD_MAX_LENGTH: 80,
  LOCATION_CODE_MAX_LENGTH: 120,
  REASON_MAX_LENGTH: 500,
  MAX_LAB_IDS: 20,
  MAX_HAZARD_CLASSES: 10,
} as const;

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  laboratoryIds: string[];
  status: UserStatus;
  createdAt: Timestamp | Date | string;
  lastLogin: Timestamp | Date | string;
  avatarUrl?: string;
  isDemoAccount?: boolean;
  /**
   * Server-managed flag: set by the provisioning API when the Director creates
   * an account with a temporary password; cleared only through
   * POST /api/admin/complete-password-change after the user sets a new one.
   * Never writable by any client (rules keep it out of every allowlist).
   */
  mustChangePassword?: boolean;
}

export interface Laboratory {
  labId: string;
  name: string;
  createdAt: Timestamp | Date | string;
}

export interface Product {
  productId: string;
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
  createdAt: Timestamp | Date | string;
  updatedAt: Timestamp | Date | string;
  // Extended classification & demo markers
  chemicalClassification?: ChemicalClassification | string;
  storageClassification?: StorageClassification | string;
  isDemoData?: boolean;
}

/**
 * Physical Storage Location
 * Hierarchy: Room -> Cabinet (unit) -> Side (Left / Right) -> Shelf -> Position
 * Generated Code: e.g. R204-FLAM01-L-S02-P01
 */
export interface StorageLocation {
  building: string;
  room: string;
  unit: string; // Cabinet code, e.g. FLAM-01, CAB-02
  cabinetLabel?: string; // e.g. Flammable Cabinet
  side?: 'Left' | 'Right'; // Left and Right are separate physical locations
  shelf: string; // e.g. 1, 2, 3
  position: string; // e.g. 01, 02, 03
  code: string; // e.g. R204-FLAM01-L-S02-P01
}

export interface PhysicalLocationConfig {
  id: string;
  room: string;
  cabinet: string;
  cabinetLabel: string;
  storageClassification: StorageClassification | string;
  sides: ('Left' | 'Right')[];
  shelves: string[];
  positions: string[];
  /** Custom 2D Floor Plan Percentage Coordinates (0-100) & Dimensions */
  mapX?: number;
  mapY?: number;
  mapWidth?: number;
  mapHeight?: number;
  mapOrientation?: 'horizontal' | 'vertical';
  reagentClasses?: string[];
}

export interface LabFloorPlanConfig {
  backgroundImageDataUrl?: string | null;
  layoutPreset?: 'exact_user_plan' | 'perimeter_u' | 'custom_image';
  showArchitecturalOverlay?: boolean;
  updatedAt?: string;
}

export interface ChemicalContainer {
  containerId: string;
  productId: string;
  laboratoryId: string;
  initialQuantity: number;
  currentQuantity: number;
  unit: ChemicalUnit;
  location: StorageLocation;
  storageCondition: string;
  status: ContainerStatus;
  lotNumber: string;
  supplier: string;
  expiryDate: string;
  createdAt: Timestamp | Date | string;
  updatedAt: Timestamp | Date | string;
  createdBy: string;
  chemicalClassification?: ChemicalClassification | string;
  storageClassification?: StorageClassification | string;
  isDemoData?: boolean;
}

export interface InventoryTransaction {
  transactionId: string;
  type: TransactionType;
  timestamp: Timestamp | Date | string;
  userId: string;
  userName: string;
  userRole?: UserRole;
  laboratoryId: string;
  containerId: string;
  productId: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unit: ChemicalUnit;
  oldLocation: string;
  newLocation: string;
  oldStatus: ContainerStatus;
  newStatus: ContainerStatus;
  reason: string;
  adjustmentType?: StockAdjustmentReasonType | string;
  isDemoData?: boolean;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
