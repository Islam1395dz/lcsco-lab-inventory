/**
 * Reusable Role-Based Notification & Stock Rupture Domain Engine
 *
 * Implements:
 * 1. Role-based recipient filtering (only relevant roles/users receive each notification)
 * 2. Extensible notification types (STOCK_RUPTURE, LOW_STOCK, EXPIRING_SOON, EXPIRED_CHEMICAL,
 *    PURCHASE_REQUEST, PURCHASE_APPROVED, PURCHASE_RECEIVED, DISPOSAL_REQUEST,
 *    STOCK_ADJUSTMENT_REQUEST, SYSTEM_NOTIFICATION)
 * 3. Priorities (LOW, MEDIUM, HIGH, CRITICAL)
 * 4. Duplicate stock rupture prevention (merges or increments report counter instead of spamming)
 * 5. Stock Rupture Workflow:
 *    REPORTED -> UNDER_REVIEW -> CONFIRMED -> RESOLVED
 *    or REPORTED -> REJECTED
 */

import {
  AppNotification,
  ChemicalContainer,
  NotificationPriority,
  NotificationType,
  Product,
  StockRuptureRequest,
  StockRuptureStatus,
  UserProfile,
  UserRole,
  UserStatus,
} from '../types/inventory';
import { ADMIN_ROLES, isAdminRole } from '../utils/roles';

export interface CreateRoleNotificationParams {
  type: NotificationType | string;
  title: string;
  message: string;
  priority: NotificationPriority;
  targetRoles?: UserRole[];
  targetUserIds?: string[];
  excludeCreator?: boolean;
  createdByUserId: string;
  createdByName?: string;
  relatedContainerId?: string;
  relatedProductId?: string;
  relatedChemicalName?: string;
  relatedRequestId?: string;
  reportCount?: number;
}

/**
 * Default role routing matrix per notification type when `targetRoles` is not explicitly overridden.
 * Strictly follows the laboratory notification matrix:
 * - Director / Secretary: Stock rupture reports, purchase requests, disposal requests, stock adjustment requests, critical inventory alerts
 * - Technician: Stock rupture reports, low-stock alerts, expiration alerts, purchase deliveries, disposal tasks, stock adjustment requests
 * - Professor: Purchase requests, disposal requests, low-stock alerts, important stock issues
 * - PhD Student: Their own requests, request approval/rejection, purchase availability, important inventory changes
 */
export const DEFAULT_ROLES_BY_NOTIFICATION_TYPE: Record<string, UserRole[]> = {
  [NotificationType.STOCK_RUPTURE]: [...ADMIN_ROLES, UserRole.TECHNICIAN],
  [NotificationType.LOW_STOCK]: [...ADMIN_ROLES, UserRole.PROFESSOR, UserRole.TECHNICIAN],
  [NotificationType.EXPIRING_SOON]: [UserRole.TECHNICIAN, UserRole.PROFESSOR],
  [NotificationType.EXPIRED_CHEMICAL]: [...ADMIN_ROLES, UserRole.TECHNICIAN, UserRole.PROFESSOR],
  [NotificationType.PURCHASE_REQUEST]: [...ADMIN_ROLES, UserRole.PROFESSOR],
  [NotificationType.PURCHASE_APPROVED]: [UserRole.TECHNICIAN],
  [NotificationType.PURCHASE_RECEIVED]: [
    ...ADMIN_ROLES,
    UserRole.PROFESSOR,
    UserRole.STUDENT_RESEARCHER,
  ],
  [NotificationType.DISPOSAL_REQUEST]: [...ADMIN_ROLES, UserRole.PROFESSOR, UserRole.TECHNICIAN],
  [NotificationType.STOCK_ADJUSTMENT_REQUEST]: [...ADMIN_ROLES, UserRole.TECHNICIAN],
  [NotificationType.SYSTEM_NOTIFICATION]: [
    ...ADMIN_ROLES,
    UserRole.PROFESSOR,
    UserRole.TECHNICIAN,
    UserRole.STUDENT_RESEARCHER,
  ],
};

/**
 * Generates individual notifications for each active recipient matching either `targetRoles` or `targetUserIds`.
 * Does NOT send every notification to every user.
 */
export function buildNotificationsForRecipients(
  allUsers: UserProfile[],
  params: CreateRoleNotificationParams,
  timestampIso = new Date().toISOString()
): AppNotification[] {
  const effectiveRoles =
    params.targetRoles ?? DEFAULT_ROLES_BY_NOTIFICATION_TYPE[params.type] ?? [];
  const explicitUserIds = new Set(params.targetUserIds || []);
  const targetsAdministrators = effectiveRoles.some((role) => isAdminRole(role));

  const recipients = allUsers.filter((u) => {
    if (u.status === UserStatus.DEACTIVATED) return false;
    if (params.excludeCreator && u.uid === params.createdByUserId) return false;
    if (explicitUserIds.has(u.uid)) return true;
    // ADMIN and SECRETARY are interchangeable for routing purposes: a
    // notification addressed to "the Director" must also reach the Secretary.
    if (targetsAdministrators && isAdminRole(u.role)) return true;
    return effectiveRoles.includes(u.role);
  });

  return recipients.map((recipient, idx) => ({
    notificationId: `NTF-${Date.now().toString(36).toUpperCase()}-${idx}-${recipient.uid.slice(-4)}`,
    type: params.type,
    title: params.title,
    message: params.message,
    priority: params.priority,
    recipientUserId: recipient.uid,
    recipientRole: recipient.role,
    relatedContainerId: params.relatedContainerId,
    relatedProductId: params.relatedProductId,
    relatedChemicalName: params.relatedChemicalName,
    relatedRequestId: params.relatedRequestId,
    createdByUserId: params.createdByUserId,
    createdByName: params.createdByName,
    createdAt: timestampIso,
    isRead: false,
    isResolved: false,
    reportCount: params.reportCount || 1,
  }));
}

/**
 * Filters and sorts notifications belonging to a specific user ID.
 */
export function getNotificationsForUser(
  notifications: AppNotification[],
  userId: string | undefined | null
): AppNotification[] {
  if (!userId) return [];
  return notifications
    .filter((n) => n.recipientUserId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Computes unread notification count for a user.
 */
export function getUnreadNotificationCount(
  notifications: AppNotification[],
  userId: string | undefined | null
): number {
  if (!userId) return 0;
  return notifications.filter((n) => n.recipientUserId === userId && !n.isRead).length;
}

/**
 * Marks a single notification as read without deleting it from history.
 */
export function markNotificationReadInList(
  notifications: AppNotification[],
  notificationId: string,
  readAtIso = new Date().toISOString()
): AppNotification[] {
  return notifications.map((n) =>
    n.notificationId === notificationId
      ? {
          ...n,
          isRead: true,
          readAt: n.readAt || readAtIso,
        }
      : n
  );
}

/**
 * Marks all unread notifications for a user as read without deleting them from history.
 */
export function markAllUserNotificationsReadInList(
  notifications: AppNotification[],
  userId: string,
  readAtIso = new Date().toISOString()
): AppNotification[] {
  return notifications.map((n) =>
    n.recipientUserId === userId && !n.isRead
      ? {
          ...n,
          isRead: true,
          readAt: readAtIso,
        }
      : n
  );
}

/**
 * Resolves all notifications linked to a specific request ID (e.g. Stock Rupture, Purchase, Disposal, Adjustment).
 */
export function resolveNotificationsByRequestId(
  notifications: AppNotification[],
  relatedRequestId: string,
  resolverUserId: string,
  resolverName?: string,
  resolvedAtIso = new Date().toISOString()
): AppNotification[] {
  return notifications.map((n) =>
    n.relatedRequestId === relatedRequestId
      ? {
          ...n,
          isResolved: true,
          resolvedAt: resolvedAtIso,
          resolverUserId,
          resolverName,
        }
      : n
  );
}

/**
 * Processes a "Report Stock Rupture" submission with Duplicate Notification Prevention:
 * - Does NOT automatically modify the inventory quantity.
 * - Does NOT assume stock is zero without Technician verification.
 * - If an active stock rupture report (`REPORTED` or `UNDER_REVIEW`) already exists for the same
 *   container/chemical, increments `reportCount`, appends the reporter entry, and updates existing
 *   notifications for active Directors and Technicians (putting them back to unread with updated count)
 *   instead of creating duplicate notifications.
 * - Otherwise creates a new `StockRuptureRequest` (status `REPORTED`) and sends notifications
 *   specifically to all active Directors (`ADMIN`) and Technicians (`TECHNICIAN`), plus a confirmation
 *   entry in the reporting user's own notification history.
 */
export function processStockRuptureReport(params: {
  container: ChemicalContainer;
  product?: Product;
  reporter: {
    uid: string;
    fullName: string;
    role: UserRole;
  };
  comment?: string;
  priority: NotificationPriority;
  existingRuptures: StockRuptureRequest[];
  existingNotifications: AppNotification[];
  allUsers: UserProfile[];
  timestampIso?: string;
}): {
  ruptureRequest: StockRuptureRequest;
  updatedRuptures: StockRuptureRequest[];
  updatedNotifications: AppNotification[];
  wasMergedDuplicate: boolean;
} {
  const nowIso = params.timestampIso || new Date().toISOString();
  const chemName = params.product?.chemicalName || params.container.productId;
  const cleanComment = params.comment?.trim() || 'Stock rupture reported from laboratory bench.';

  // Check if an active (REPORTED or UNDER_REVIEW) stock rupture already exists for this container/chemical
  const existingActive = params.existingRuptures.find(
    (r) =>
      (r.containerId === params.container.containerId ||
        r.productId === params.container.productId) &&
      (r.status === StockRuptureStatus.REPORTED || r.status === StockRuptureStatus.UNDER_REVIEW)
  );

  if (existingActive) {
    const newCount = existingActive.reportCount + 1;
    const priorityOrder: Record<NotificationPriority, number> = {
      [NotificationPriority.LOW]: 1,
      [NotificationPriority.MEDIUM]: 2,
      [NotificationPriority.HIGH]: 3,
      [NotificationPriority.CRITICAL]: 4,
    };
    const escalatedPriority =
      priorityOrder[params.priority] > priorityOrder[existingActive.priority]
        ? params.priority
        : existingActive.priority;

    const updatedRupture: StockRuptureRequest = {
      ...existingActive,
      priority: escalatedPriority,
      reportCount: newCount,
      comment: cleanComment,
      reporters: [
        ...existingActive.reporters,
        {
          reporterUid: params.reporter.uid,
          reporterName: params.reporter.fullName,
          reporterRole: params.reporter.role,
          reportedAt: nowIso,
          comment: cleanComment,
        },
      ],
    };

    const updatedRuptures = params.existingRuptures.map((r) =>
      r.ruptureId === existingActive.ruptureId ? updatedRupture : r
    );

    // Update existing STOCK_RUPTURE notifications for this ruptureId instead of creating duplicates
    const updatedNotifications = params.existingNotifications.map((n) => {
      if (n.relatedRequestId === existingActive.ruptureId && n.type === NotificationType.STOCK_RUPTURE) {
        return {
          ...n,
          title: `Stock rupture reported (${newCount} reports): ${chemName}`,
          message: `${params.reporter.fullName} also reported "${chemName}" (${params.container.containerId}) as out of stock (${newCount} total reports). Digital stock shows ${params.container.currentQuantity} ${params.container.unit}. Note: "${cleanComment}"`,
          priority: escalatedPriority,
          isRead: false, // Re-surface in notification bell without duplicating
          createdAt: nowIso,
          reportCount: newCount,
        };
      }
      return n;
    });

    return {
      ruptureRequest: updatedRupture,
      updatedRuptures,
      updatedNotifications,
      wasMergedDuplicate: true,
    };
  }

  // Create a fresh Stock Rupture Request
  const ruptureId = `RUP-${Date.now().toString(36).toUpperCase()}`;
  const newRupture: StockRuptureRequest = {
    ruptureId,
    containerId: params.container.containerId,
    productId: params.container.productId,
    chemicalName: chemName,
    casNumber: params.product?.casNumber || 'N/A',
    formula: params.product?.formula || 'N/A',
    laboratoryId: params.container.laboratoryId,
    locationCode: params.container.location.code,
    currentInventoryQuantity: params.container.currentQuantity,
    unit: params.container.unit,
    currentInventoryStatus: params.container.status,
    reportedByUid: params.reporter.uid,
    reportedByName: params.reporter.fullName,
    reportedByRole: params.reporter.role,
    reportedAt: nowIso,
    comment: cleanComment,
    priority: params.priority,
    status: StockRuptureStatus.REPORTED,
    reportCount: 1,
    reporters: [
      {
        reporterUid: params.reporter.uid,
        reporterName: params.reporter.fullName,
        reporterRole: params.reporter.role,
        reportedAt: nowIso,
        comment: cleanComment,
      },
    ],
  };

  // Send notifications to all active Directors (ADMIN) and all active Technicians (TECHNICIAN)
  const directorAndTechAlerts = buildNotificationsForRecipients(
    params.allUsers,
    {
      type: NotificationType.STOCK_RUPTURE,
      title: `Stock rupture reported: ${chemName}`,
      message: `${params.reporter.fullName} reported "${chemName} — stock rupture" on bottle ${params.container.containerId} (Location: ${params.container.location.code}). Digital inventory currently lists ${params.container.currentQuantity} ${params.container.unit} (${params.container.status}). Please inspect physical stock. Comment: "${cleanComment}"`,
      priority: params.priority,
      targetRoles: [...ADMIN_ROLES, UserRole.TECHNICIAN],
      createdByUserId: params.reporter.uid,
      createdByName: params.reporter.fullName,
      relatedContainerId: params.container.containerId,
      relatedProductId: params.container.productId,
      relatedChemicalName: chemName,
      relatedRequestId: ruptureId,
      reportCount: 1,
    },
    nowIso
  );

  // Also record a tracking notification for the reporting PhD student if they aren't already a Director/Tech
  const reporterAlreadyNotified = directorAndTechAlerts.some(
    (n) => n.recipientUserId === params.reporter.uid
  );
  const reporterSelfNotification = reporterAlreadyNotified
    ? []
    : buildNotificationsForRecipients(
        params.allUsers,
        {
          type: NotificationType.STOCK_RUPTURE,
          title: `Your Stock Rupture Report Submitted: ${chemName}`,
          message: `Your stock rupture report (${ruptureId}) for ${chemName} (${params.container.containerId}) has been sent to the Laboratory Director/Secretary and Technician for physical verification.`,
          priority: params.priority,
          targetRoles: [],
          targetUserIds: [params.reporter.uid],
          createdByUserId: params.reporter.uid,
          createdByName: params.reporter.fullName,
          relatedContainerId: params.container.containerId,
          relatedProductId: params.container.productId,
          relatedChemicalName: chemName,
          relatedRequestId: ruptureId,
          reportCount: 1,
        },
        nowIso
      );

  return {
    ruptureRequest: newRupture,
    updatedRuptures: [newRupture, ...params.existingRuptures],
    updatedNotifications: [
      ...directorAndTechAlerts,
      ...reporterSelfNotification,
      ...params.existingNotifications,
    ],
    wasMergedDuplicate: false,
  };
}

/**
 * Transitions a Stock Rupture Request through the workflow:
 * REPORTED -> UNDER_REVIEW -> CONFIRMED -> RESOLVED
 * or REPORTED -> REJECTED
 *
 * Also notifies all reporters (e.g. PhD Students), Professors (when confirmed), and Directors/Technicians.
 * Never automatically zeroes the inventory quantity without an explicit stock management workflow action.
 */
export function transitionStockRuptureWorkflow(params: {
  ruptureId: string;
  nextStatus: StockRuptureStatus;
  actor: {
    uid: string;
    fullName: string;
    role: UserRole;
  };
  resolutionNote?: string;
  existingRuptures: StockRuptureRequest[];
  existingNotifications: AppNotification[];
  allUsers: UserProfile[];
  timestampIso?: string;
}): {
  updatedRupture: StockRuptureRequest;
  updatedRuptures: StockRuptureRequest[];
  updatedNotifications: AppNotification[];
} {
  const nowIso = params.timestampIso || new Date().toISOString();
  const target = params.existingRuptures.find((r) => r.ruptureId === params.ruptureId);
  if (!target) {
    throw new Error(`Stock rupture report ${params.ruptureId} not found.`);
  }

  const isTerminal =
    params.nextStatus === StockRuptureStatus.RESOLVED ||
    params.nextStatus === StockRuptureStatus.REJECTED;

  const updatedRupture: StockRuptureRequest = {
    ...target,
    status: params.nextStatus,
    reviewedByUid: params.actor.uid,
    reviewedByName: params.actor.fullName,
    reviewedByRole: params.actor.role,
    reviewedAt: nowIso,
    resolutionNote: params.resolutionNote?.trim() || target.resolutionNote,
    ...(isTerminal
      ? {
          resolvedByUid: params.actor.uid,
          resolvedByName: params.actor.fullName,
          resolvedAt: nowIso,
        }
      : {}),
  };

  const updatedRuptures = params.existingRuptures.map((r) =>
    r.ruptureId === params.ruptureId ? updatedRupture : r
  );

  // Collect all unique reporter UIDs so every PhD Student who reported this chemical receives an update
  const reporterUids = Array.from(new Set(target.reporters.map((rep) => rep.reporterUid)));

  let statusTitle = `Stock Rupture Update (${params.nextStatus}): ${target.chemicalName}`;
  let statusMessage = `${params.actor.fullName} updated stock rupture report ${target.ruptureId} for ${target.chemicalName} (${target.containerId}) to ${params.nextStatus}.`;
  let targetRoles: UserRole[] = [];

  if (params.nextStatus === StockRuptureStatus.UNDER_REVIEW) {
    statusTitle = `Stock Rupture Under Review: ${target.chemicalName}`;
    statusMessage = `${params.actor.fullName} is inspecting physical stock for ${target.chemicalName} (${target.containerId}) at ${target.locationCode}.`;
    targetRoles = [...ADMIN_ROLES];
  } else if (params.nextStatus === StockRuptureStatus.CONFIRMED) {
    statusTitle = `Stock Rupture Confirmed: ${target.chemicalName}`;
    statusMessage = `Physical inspection by ${params.actor.fullName} CONFIRMED stock rupture for ${target.chemicalName} (${target.containerId}). Stock adjustment / replenishment workflow initiated.${
      params.resolutionNote ? ` Note: "${params.resolutionNote}"` : ''
    }`;
    // Notify Director, Professor (important stock issue for research group), and reporting PhD students
    targetRoles = [...ADMIN_ROLES, UserRole.PROFESSOR];
  } else if (params.nextStatus === StockRuptureStatus.RESOLVED) {
    statusTitle = `Stock Rupture Resolved: ${target.chemicalName}`;
    statusMessage = `Stock rupture ${target.ruptureId} for ${target.chemicalName} (${target.containerId}) has been RESOLVED by ${params.actor.fullName}.${
      params.resolutionNote ? ` Note: "${params.resolutionNote}"` : ''
    }`;
    targetRoles = [...ADMIN_ROLES, UserRole.PROFESSOR];
  } else if (params.nextStatus === StockRuptureStatus.REJECTED) {
    statusTitle = `Stock Rupture Report Rejected: ${target.chemicalName}`;
    statusMessage = `Physical inspection by ${params.actor.fullName} found stock available for ${target.chemicalName} (${target.containerId} at ${target.locationCode}). Report ${target.ruptureId} was marked REJECTED.${
      params.resolutionNote ? ` Note: "${params.resolutionNote}"` : ''
    }`;
    targetRoles = [...ADMIN_ROLES];
  }

  const followUpNotifications = buildNotificationsForRecipients(
    params.allUsers,
    {
      type: NotificationType.STOCK_RUPTURE,
      title: statusTitle,
      message: statusMessage,
      priority:
        params.nextStatus === StockRuptureStatus.CONFIRMED
          ? NotificationPriority.CRITICAL
          : target.priority,
      targetRoles,
      targetUserIds: reporterUids,
      excludeCreator: false,
      createdByUserId: params.actor.uid,
      createdByName: params.actor.fullName,
      relatedContainerId: target.containerId,
      relatedProductId: target.productId,
      relatedChemicalName: target.chemicalName,
      relatedRequestId: target.ruptureId,
      reportCount: target.reportCount,
    },
    nowIso
  );

  const baseNotifications = isTerminal
    ? resolveNotificationsByRequestId(
        params.existingNotifications,
        target.ruptureId,
        params.actor.uid,
        params.actor.fullName,
        nowIso
      )
    : params.existingNotifications;

  return {
    updatedRupture,
    updatedRuptures,
    updatedNotifications: [...followUpNotifications, ...baseNotifications],
  };
}
