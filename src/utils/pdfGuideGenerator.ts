/**
 * LCSCO Illustrated PDF User Manual Generator (`pdfGuideGenerator.ts`)
 * Precision-aligned multi-page downloadable PDF manuals with embedded
 * interface screenshots and step-by-step operational guides for each of the 4 LCSCO accounts:
 *   1. Director
 *   2. Technician
 *   3. Professor
 *   4. PhD Student
 */

import { jsPDF } from 'jspdf';
import { UserRole } from '../types/inventory';

export interface RoleManualSpec {
  role: UserRole;
  title: string;
  username: string;
  email: string;
  badge: string;
  accentColor: [number, number, number];
  overview: string;
  allowedActions: string[];
  restrictedActions: string[];
  screenMockup: {
    activeNav: string;
    windowTitle: string;
    primaryWidgetTitle: string;
    primaryWidgetSubtitle: string;
    deleteButtonState: 'ENABLED' | 'LOCKED';
    highlightBanner: string;
    sampleActionText: string;
  };
  stepByStepWorkflows: Array<{
    stepNumber: string;
    workflowTitle: string;
    navigationPath: string;
    instructions: string[];
    expectedResult: string;
  }>;
}

export interface RoleGuideSection {
  role: UserRole;
  title: string;
  badge: string;
  email: string;
  overview: string;
  allowedActions: string[];
  restrictedActions: string[];
  screenMockup: {
    activeNav: string;
    windowTitle: string;
    primaryWidgetTitle: string;
    primaryWidgetSubtitle: string;
    deleteButtonState: 'ENABLED' | 'LOCKED' | 'LOCKED (Director Only)' | string;
    highlightBanner: string;
    sampleActionText: string;
  };
  stepByStepWorkflows: Array<{
    stepNumber: string;
    workflowTitle: string;
    navigationPath: string;
    instructions: string[];
    expectedResult: string;
  }>;
}

export const LCSCO_ROLE_MANUALS: RoleManualSpec[] = [
  {
    role: UserRole.ADMIN,
    title: 'Director',
    username: 'Director',
    email: 'director@lcsco.dz',
    badge: 'FULL INSTITUTIONAL AUTHORITY (ADMIN)',
    accentColor: [27, 138, 42], // LCSCO Emerald #1B8A2A
    overview:
      'As the LCSCO Laboratory Director, you hold exclusive authority to add or remove user profiles, manage all chemical catalog items and physical containers, resolve quarantined vessels, and audit all laboratory operations.',
    allowedActions: [
      'Exclusive Authority to Add or Remove LCSCO User Profiles',
      'Full CRUD on Chemical Catalog Products & Physical Bottles',
      'Approve / Restore or Mark for Disposal Quarantined Containers',
      'Perform Express Bench Withdrawals with Automatic Subtraction',
      'Delete Physical Containers (Unlocked for Director or Secretary)',
    ],
    restrictedActions: [
      'Cannot modify or delete historical records in the Immutable Audit Trail (Append-Only Security Rule)',
    ],
    screenMockup: {
      activeNav: 'Profile',
      windowTitle: 'LCSCO Console - Director Governance & Profile Control',
      primaryWidgetTitle: 'Administrator: Add or Remove LCSCO Profiles + Quarantine Queue',
      primaryWidgetSubtitle: 'ACD-201 (Hydrochloric Acid 37%) - Status: NEEDS_IDENTIFICATION',
      deleteButtonState: 'ENABLED',
      highlightBanner: 'DIRECTOR PRIVILEGE: [Add/Remove Profiles]  [Restore/Dispose]  [Delete Unlocked]',
      sampleActionText: '1850 mL - 50 mL = 1800 mL (Auto-Subtracted & Logged)',
    },
    stepByStepWorkflows: [
      {
        stepNumber: 'WORKFLOW 1',
        workflowTitle: 'Adding or Removing LCSCO Researcher Profiles (Administrator)',
        navigationPath: 'Navigation Bar -> Profile',
        instructions: [
          'Sign in with your LCSCO laboratory account (Firebase Authentication — Google or email/password).',
          'Click "Profile" in the top navigation bar (next to Dashboard and Guide / How to Use).',
          'Update your own password or attach a profile picture in "My Account & Security Settings".',
          'Scroll to "Administrator: Add or Remove LCSCO Profiles" to create new accounts or click the red "Remove Profile" button next to any user.',
        ],
        expectedResult:
          'Only the Director or Secretary can add or remove profiles; other accounts see a locked notice.',
      },
      {
        stepNumber: 'WORKFLOW 2',
        workflowTitle: 'Resolving Quarantined or Unidentified Chemical Bottles',
        navigationPath: 'Navigation Bar -> Dashboard',
        instructions: [
          'On the Dashboard, locate the "Identification & Quarantine Review Queue" panel.',
          'Enter a verification note for the flagged container (e.g., ACD-201).',
          'Click "Identify / Restore" to return the bottle to active stock, or "Mark for Disposal" to decommission it.',
        ],
        expectedResult:
          'Container status updates atomically and an immutable STATUS_CHANGE entry is recorded.',
      },
      {
        stepNumber: 'WORKFLOW 3',
        workflowTitle: 'Deleting Obsolete Containers & Exporting CSV Audits',
        navigationPath: 'Navigation Bar -> Reagents & Solvents',
        instructions: [
          'Open "Reagents & Solvents" from the navigation bar.',
          'Click the unlocked red Trash button in the rightmost column to delete any obsolete bottle, or click "Export CSV" to download the full inventory spreadsheet.',
        ],
        expectedResult:
          'Selected container is deleted while all past audit transactions remain preserved.',
      },
    ],
  },
  {
    role: UserRole.TECHNICIAN,
    title: 'Lab Engineer',
    username: 'Lab Engineer',
    email: 'lab.engineer@lcsco.dz',
    badge: 'OPERATIONAL INVENTORY MANAGER & STORAGE PLACEMENT',
    accentColor: [30, 58, 138], // LCSCO Deep Blue #1E3A8A
    overview:
      'As the LCSCO Lab Engineer, you manage operational inventory, register newly delivered chemical bottles, assign their physical location (Room -> Cabinet -> Side -> Shelf -> Position), run Co-Location Compatibility scans, and perform controlled quantity adjustments.',
    allowedActions: [
      'Register New Physical Chemical Bottles & Add Catalog Products',
      'Assign Physical Locations (Room, Cabinet, Left/Right Side, Shelf, Position)',
      'Perform Controlled Quantity Adjustments with Mandatory Reason & Audit Trail',
      'Transfer Containers Between Rooms, Cabinets, Sides, and Shelves',
      'Print Thermal QR Code Bottle Labels & Withdraw Reagents',
    ],
    restrictedActions: [
      'LOCKED from Deleting Containers (Trash button displays a Lock icon)',
      'LOCKED from Adding or Removing User Profiles (Director or Secretary Only)',
    ],
    screenMockup: {
      activeNav: 'Reagents',
      windowTitle: 'LCSCO Console - Lab Engineer Bottle Registration & Physical Location',
      primaryWidgetTitle: 'Physical Location: Room 204 -> FLAM-01 -> Left -> Shelf 2 -> Position 01',
      primaryWidgetSubtitle: 'Generated Code: R204-FLAM01-L-S02-P01 (Co-Location Safety Verified)',
      deleteButtonState: 'LOCKED',
      highlightBanner: 'CONTROLLED QUANTITY ADJUSTMENT: Requires 2-step confirmation & reason',
      sampleActionText: 'Quantity Adjustment: 500 mL -> 350 mL (-150 mL logged)',
    },
    stepByStepWorkflows: [
      {
        stepNumber: 'WORKFLOW 1',
        workflowTitle: 'Registering a Bottle & Selecting Its Physical Location',
        navigationPath: 'Navigation Bar -> Reagents -> + Add Reagent',
        instructions: [
          'Sign in with your LCSCO laboratory account, then open "Reagents".',
          'Click "+ Add Reagent" and choose the chemical product and initial quantity.',
          'Select the physical location using separate dropdowns: Room, Cabinet, Side (Left/Right), Shelf, and Position.',
          'Verify the live generated location code (e.g., R204-FLAM01-L-S02-P01) and Co-Location Compatibility check.',
        ],
        expectedResult:
          'Bottle is registered with its readable physical hierarchy and verified safe co-location.',
      },
      {
        stepNumber: 'WORKFLOW 2',
        workflowTitle: 'Performing a Controlled Quantity Adjustment',
        navigationPath: 'Click Any Bottle -> Adjust Quantity',
        instructions: [
          'Click any bottle row (e.g., SOL-002 Acetone) to open its details.',
          'Click "Adjust quantity", enter the new quantity (e.g., 350 mL), and select a mandatory reason (e.g., Physical inventory correction).',
          'Review the confirmation dialog showing Current, New, Difference, and Reason, then click "Confirm Adjustment".',
        ],
        expectedResult:
          'Stock updates atomically and creates an immutable audit trail record.',
      },
      {
        stepNumber: 'WORKFLOW 3',
        workflowTitle: 'Managing Physical Locations (Rooms, Cabinets, Left/Right Sides)',
        navigationPath: 'Navigation Bar -> Settings -> Physical Locations',
        instructions: [
          'Open "Settings" (or click "Manage Physical Locations" in the Cabinets view).',
          'Create or edit Room, Cabinet, Side (Left or Right), Shelf, and Position records.',
        ],
        expectedResult:
          'New physical locations are immediately available in all reagent placement dropdowns.',
      },
    ],
  },
  {
    role: UserRole.PROFESSOR,
    title: 'Professor',
    username: 'Professor',
    email: 'professor@lcsco.dz',
    badge: 'PRINCIPAL INVESTIGATOR & SAFETY SUPERVISOR',
    accentColor: [15, 118, 110], // Teal #0F766E
    overview:
      'As an LCSCO Professor, you supervise synthesis operations, review and resolve containers flagged as Quarantined or Needs Identification by PhD students, oversee minimum stock thresholds, and can delete obsolete containers.',
    allowedActions: [
      'Inspect & Resolve Flagged / Quarantined Containers on the Dashboard',
      'Add New Catalog Products, Register Bottles & Delete Obsolete Containers',
      'Use the Molarity & Stoichiometry Calculator for Reaction Planning',
      'Modify Own Profile Picture & Password in the Profile Section',
    ],
    restrictedActions: [
      'LOCKED from Adding or Removing User Profiles (Reserved for Director or Secretary)',
      'Cannot alter or erase historical entries in the Immutable Audit Trail',
    ],
    screenMockup: {
      activeNav: 'Dashboard',
      windowTitle: 'LCSCO Console - Professor Quarantine Resolution & Supervision',
      primaryWidgetTitle: 'Professor Review Queue: ACD-201 (Flagged: Acid vapor corroded barcode)',
      primaryWidgetSubtitle: 'Action: Verify chemical identity -> Click [Identify / Restore] or [Mark for Disposal]',
      deleteButtonState: 'ENABLED',
      highlightBanner: 'SUPERVISOR AUTHORITY: Quarantine Resolution & Container Deletion Enabled',
      sampleActionText: 'Audit Stream: PhD Student withdrew -150 mL from SOL-001 (1850 mL left)',
    },
    stepByStepWorkflows: [
      {
        stepNumber: 'WORKFLOW 1',
        workflowTitle: 'Reviewing & Resolving Bottles Flagged by PhD Students (Workflow B)',
        navigationPath: 'Navigation Bar -> Dashboard',
        instructions: [
          'Sign in with your LCSCO laboratory account (Firebase Authentication).',
          'On the Dashboard, inspect any container in the "Identification & Quarantine Review Queue" (such as ACD-201).',
          'Enter your supervisory verification note and click "Identify / Restore" or "Mark for Disposal".',
        ],
        expectedResult:
          'The locked container is either restored to active circulation or scheduled for disposal.',
      },
      {
        stepNumber: 'WORKFLOW 2',
        workflowTitle: 'Inspecting Storage Box Co-Location & Global Minimum Stock',
        navigationPath: 'Navigation Bar -> Dashboard & Profile',
        instructions: [
          'Check the "LCSCO Storage Boxes & AI Co-Location Compatibility Map" on the Dashboard to verify safe chemical segregation.',
          'Open the "Profile" tab and scroll to the "LCSCO Master Chemical Catalog" to monitor global stock against minimum reorder levels.',
        ],
        expectedResult:
          'Full visibility into reagent stock levels and cabinet safety across the LCSCO laboratory.',
      },
      {
        stepNumber: 'WORKFLOW 3',
        workflowTitle: 'Updating Your Professor Profile Picture & Password',
        navigationPath: 'Navigation Bar -> Profile',
        instructions: [
          'Click "Profile" in the top navigation bar (next to Dashboard).',
          'Click "Upload Profile Photo" to attach your picture and enter a new password to update your credentials.',
        ],
        expectedResult:
          'Your Professor profile photo appears in the header/sidebar and your new password is active.',
      },
    ],
  },
  {
    role: UserRole.PHD_STUDENT,
    title: 'PhD Student',
    username: 'PhD Student',
    email: 'phd.student@lcsco.dz',
    badge: 'BENCH SYNTHESIS RESEARCHER (AUTO-SUBTRACT & QR SCAN)',
    accentColor: [180, 83, 9], // Amber #B45309
    overview:
      'As an LCSCO PhD Student, you can scan bottle QR codes, withdraw reagents or solvents (which automatically subtracts the exact quantity from the bottle), use the stoichiometry calculator, and report damaged labels. You cannot delete items or manage other profiles.',
    allowedActions: [
      'Withdraw Reagents & Solvents with Automatic Stock Subtraction',
      'Scan Physical Bottle QR Codes via Camera (Workflow A)',
      'Use the Bench Calculator & Auto-Subtract Calculated Mass',
      'Flag Containers with Damaged Labels for Quarantine (Workflow B)',
      'Update Own Password & Attach Profile Picture in Profile Tab',
    ],
    restrictedActions: [
      'STRICTLY LOCKED from Deleting Any Bottle or Catalog Item (Lock icon shown)',
      'STRICTLY LOCKED from Adding or Removing User Profiles (Admin Only)',
    ],
    screenMockup: {
      activeNav: 'Dashboard',
      windowTitle: 'LCSCO Console - PhD Student Express Withdrawal & Auto-Subtraction',
      primaryWidgetTitle: 'LIVE STOCK EQUATION: 1850 mL - 50 mL = 1800 mL Remaining',
      primaryWidgetSubtitle: 'Bottle SOL-001 (Acetone HPLC) - Box FLAM-A - Status: NORMAL',
      deleteButtonState: 'LOCKED',
      highlightBanner: 'PHD PROTECTION ACTIVE: [Withdraw & Subtract] Unlocked  |  [Delete Item] LOCKED',
      sampleActionText: '1850 mL - 50 mL = 1800 mL (Auto-Subtracted on Confirm)',
    },
    stepByStepWorkflows: [
      {
        stepNumber: 'WORKFLOW 1',
        workflowTitle: 'Withdrawing a Reagent or Solvent (Automatic Math Subtraction)',
        navigationPath: 'Navigation Bar -> Dashboard (or Scan QR)',
        instructions: [
          'Sign in with your LCSCO laboratory account (Firebase Authentication).',
          'In "Express Bench Reagent / Solvent Withdrawal", select the bottle (e.g., SOL-001 Acetone or CAT-309 Pd/C).',
          'Enter the quantity to withdraw (e.g., 50 mL). Verify the live subtraction preview: "1850 - 50 = 1800 mL".',
          'Enter your synthesis experiment reference and click "Withdraw & Subtract Now".',
        ],
        expectedResult:
          'The quantity is automatically subtracted from the bottle and logged in the audit trail.',
      },
      {
        stepNumber: 'WORKFLOW 2',
        workflowTitle: 'Using the Molarity & Stoichiometry Calculator + 1-Click Deduction',
        navigationPath: 'Navigation Bar -> Bench Calculator',
        instructions: [
          'Click "Bench Calculator" in the top navigation bar.',
          'Select a reagent bottle (e.g., REA-104 Sodium Borohydride), enter target Molarity and Volume (or Reaction Equivalents).',
          'Click "Subtract X g from REA-104 Now" to deduct the exact calculated mass directly from the bottle.',
        ],
        expectedResult:
          'Exact stoichiometric mass is calculated and subtracted from the LCSCO inventory in one click.',
      },
      {
        stepNumber: 'WORKFLOW 3',
        workflowTitle: 'Customizing Your PhD Profile Picture & Password',
        navigationPath: 'Navigation Bar -> Profile',
        instructions: [
          'Click "Profile" in the top navigation bar (next to Dashboard).',
          'Attach your profile picture, update your display name, or change your password.',
        ],
        expectedResult:
          'Your personal PhD profile is updated while role security locks remain enforced.',
      },
    ],
  },
];

/**
 * Draws a strictly aligned, overflow-safe annotated UI screenshot mockup
 * inside the PDF page (x = 14mm, width = 182mm).
 */
function drawAnnotatedScreenMockup(
  doc: jsPDF,
  spec: RoleManualSpec,
  startY: number
): number {
  const x = 14;
  const w = 182;
  const h = 68;

  // Outer Browser Frame
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x, startY, w, h, 2, 2, 'FD');

  // Top Browser Title Bar
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x, startY, w, 7.5, 2, 2, 'F');
  doc.rect(x, startY + 4, w, 3.5, 'F');

  // Window Control Dots
  doc.setFillColor(239, 68, 68);
  doc.circle(x + 4, startY + 3.8, 1, 'F');
  doc.setFillColor(245, 158, 11);
  doc.circle(x + 7.5, startY + 3.8, 1, 'F');
  doc.setFillColor(16, 185, 129);
  doc.circle(x + 11, startY + 3.8, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(255, 255, 255);
  doc.text(`SCREENSHOT: ${spec.screenMockup.windowTitle}`, x + 16, startY + 4.8);

  // App Top Navigation Bar inside Screenshot
  const headerY = startY + 7.5;
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 0.4, headerY, w - 0.8, 7.5, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.line(x, headerY + 7.5, x + w, headerY + 7.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(27, 138, 42);
  doc.text('LCSCO Inventory', x + 3.5, headerY + 4.9);

  // Fixed-coordinate Navigation Links to prevent any overlap
  const navColumns: Array<{ label: string; colX: number }> = [
    { label: 'Dashboard', colX: x + 30 },
    { label: 'Profile', colX: x + 49 },
    { label: 'Guide / How to Use', colX: x + 63 },
    { label: 'Reagents & Solvents', colX: x + 92 },
    { label: 'Bench Calculator', colX: x + 123 },
    { label: 'QR Labels', colX: x + 150 },
  ];

  navColumns.forEach((nav) => {
    const isCurrent = nav.label === spec.screenMockup.activeNav;
    doc.setFont('helvetica', isCurrent ? 'bold' : 'normal');
    doc.setFontSize(5.3);
    doc.setTextColor(isCurrent ? 27 : 100, isCurrent ? 138 : 116, isCurrent ? 42 : 139);
    doc.text(nav.label, nav.colX, headerY + 4.9);
    if (isCurrent) {
      const tw = doc.getTextWidth(nav.label);
      doc.setDrawColor(27, 138, 42);
      doc.setLineWidth(0.5);
      doc.line(nav.colX, headerY + 6.4, nav.colX + tw, headerY + 6.4);
    }
  });

  // Left Sidebar inside Screenshot
  const bodyY = headerY + 7.5;
  const bodyH = h - 15;
  const sideW = 40;
  doc.setFillColor(255, 255, 255);
  doc.rect(x + 0.4, bodyY, sideW, bodyH - 0.4, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.line(x + sideW, bodyY, x + sideW, startY + h);

  // Active Profile Card inside Sidebar
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(x + 2.5, bodyY + 3, sideW - 5, 20, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(100, 116, 139);
  doc.text('LOGGED IN PROFILE:', x + 4.5, bodyY + 7.5);
  doc.setFontSize(6.5);
  doc.setTextColor(spec.accentColor[0], spec.accentColor[1], spec.accentColor[2]);
  doc.text(spec.title, x + 4.5, bodyY + 12.5);
  doc.setFont('courier', 'normal');
  doc.setFontSize(4.8);
  doc.setTextColor(71, 85, 105);
  doc.text(spec.email, x + 4.5, bodyY + 17);
  doc.text('Lab: LCSCO', x + 4.5, bodyY + 21);

  // Role Security Matrix inside Sidebar
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x + 2.5, bodyY + 25.5, sideW - 5, 24, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(52, 211, 153);
  doc.text('CAPABILITIES:', x + 4.5, bodyY + 30);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text('+ Withdraw: YES', x + 4.5, bodyY + 35);
  doc.text('+ Edit Profile: YES', x + 4.5, bodyY + 39.5);
  doc.text(
    `+ Delete Item: ${spec.screenMockup.deleteButtonState === 'ENABLED' ? 'YES' : 'LOCKED'}`,
    x + 4.5,
    bodyY + 44
  );
  doc.text(
    `+ Add Users: ${spec.role === UserRole.ADMIN ? 'YES' : 'LOCKED'}`,
    x + 4.5,
    bodyY + 48
  );

  // Main Content Area inside Screenshot
  const mainX = x + sideW + 3.5;
  const mainW = w - sideW - 7;

  // Top Role Banner
  doc.setFillColor(spec.accentColor[0], spec.accentColor[1], spec.accentColor[2]);
  doc.roundedRect(mainX, bodyY + 3, mainW, 7.5, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(255, 255, 255);
  doc.text(spec.screenMockup.highlightBanner, mainX + 3, bodyY + 7.9);

  // Primary Action Widget Box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(mainX, bodyY + 12.5, mainW, 22, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(15, 23, 42);
  doc.text(spec.screenMockup.primaryWidgetTitle, mainX + 3, bodyY + 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105);
  doc.text(spec.screenMockup.primaryWidgetSubtitle, mainX + 3, bodyY + 22.5);

  // Dark Math / Status Preview Bar
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(mainX + 3, bodyY + 25, mainW - 6, 7, 1, 1, 'F');
  doc.setFont('courier', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(52, 211, 153);
  doc.text(spec.screenMockup.sampleActionText, mainX + 5.5, bodyY + 29.8);

  // Simulated Inventory Table Row
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(mainX, bodyY + 36.5, mainW, 13, 1.2, 1.2, 'FD');

  doc.setFont('courier', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(30, 58, 138);
  doc.text('SOL-001', mainX + 3, bodyY + 42);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Acetone (HPLC >=99.9%)', mainX + 16, bodyY + 42);

  doc.setFont('courier', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(71, 85, 105);
  doc.text('Box FLAM-A | Rm 204 | 1850 mL', mainX + 3, bodyY + 47);

  // Row Buttons on Right
  doc.setFillColor(27, 138, 42);
  doc.roundedRect(mainX + mainW - 47, bodyY + 39, 21, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.2);
  doc.setTextColor(255, 255, 255);
  doc.text('Withdraw', mainX + mainW - 36.5, bodyY + 44.2, { align: 'center' });

  if (spec.screenMockup.deleteButtonState === 'ENABLED') {
    doc.setFillColor(225, 29, 72);
    doc.roundedRect(mainX + mainW - 24, bodyY + 39, 21, 8, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Delete', mainX + mainW - 13.5, bodyY + 44.2, { align: 'center' });
  } else {
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(mainX + mainW - 24, bodyY + 39, 21, 8, 1, 1, 'F');
    doc.setTextColor(100, 116, 139);
    doc.text('LOCKED', mainX + mainW - 13.5, bodyY + 44.2, { align: 'center' });
  }

  return startY + h + 5.5;
}

/**
 * Renders a complete Role Guide page with dynamic height measurement so no text ever overlaps or clips.
 */
function renderRoleGuidePage(doc: jsPDF, spec: RoleManualSpec, isFirstPage: boolean) {
  if (!isFirstPage) {
    doc.addPage();
  }

  // Top Header Banner (Width 210mm, Height 25mm)
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 25, 'F');

  doc.setFillColor(spec.accentColor[0], spec.accentColor[1], spec.accentColor[2]);
  doc.rect(0, 25, 210, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(52, 211, 153);
  doc.text(
    'LCSCO INVENTORY — LABORATOIRE DE CATALYSE ET SYNTHESE EN CHIMIE ORGANIQUE',
    14,
    9.5
  );

  doc.setFontSize(13.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`USER GUIDE: ${spec.title.toUpperCase()} PROFILE`, 14, 18.5);

  // Right-aligned Credentials Box inside Header
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(132, 4, 64, 17, 1.5, 1.5, 'F');
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(`User: ${spec.username} (${spec.email})`, 135, 10.5);
  doc.setTextColor(52, 211, 153);
  doc.text('Sign-in: Firebase Authentication', 135, 16.8);

  let y = 33;

  // Section 1: Role Overview
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(spec.accentColor[0], spec.accentColor[1], spec.accentColor[2]);
  doc.text(`1. PROFILE OVERVIEW — ${spec.badge}`, 14, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  const overviewLines = doc.splitTextToSize(spec.overview, 182);
  doc.text(overviewLines, 14, y);
  y += overviewLines.length * 3.8 + 2.5;

  // Dynamic Height Measurement for Allowed vs Restricted Columns
  const colW = 89;
  doc.setFontSize(6.8);

  const allowedWrapped: string[][] = spec.allowedActions.map((act) =>
    doc.splitTextToSize(`+ ${act}`, colW - 6)
  );
  const restrictedWrapped: string[][] = spec.restrictedActions.map((res) =>
    doc.splitTextToSize(`x ${res}`, colW - 6)
  );

  const allowedLineCount = allowedWrapped.reduce((acc, l) => acc + l.length, 0);
  const restrictedLineCount = restrictedWrapped.reduce((acc, l) => acc + l.length, 0);
  const boxH = Math.max(
    26,
    Math.max(allowedLineCount, restrictedLineCount) * 3.3 + 9
  );

  // Left Box: Allowed Actions
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(14, y, colW, boxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(21, 128, 61);
  doc.text('ALLOWED PROFILE ACTIONS:', 17, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  doc.setTextColor(20, 83, 45);
  let ay = y + 9.2;
  allowedWrapped.forEach((lines) => {
    doc.text(lines, 17, ay);
    ay += lines.length * 3.2 + 0.8;
  });

  // Right Box: Security Restrictions
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(107, y, colW, boxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(190, 18, 60);
  doc.text('SECURITY RESTRICTIONS & GUARDS:', 110, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.7);
  doc.setTextColor(136, 19, 55);
  let ry = y + 9.2;
  restrictedWrapped.forEach((lines) => {
    doc.text(lines, 110, ry);
    ry += lines.length * 3.2 + 1.2;
  });

  y += boxH + 5;

  // Section 2: Annotated Interface Screenshot
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `2. INTERFACE SCREENSHOT & VISUAL GUIDE (${spec.title.toUpperCase()} VIEW)`,
    14,
    y
  );
  y += 2.8;

  y = drawAnnotatedScreenMockup(doc, spec, y);

  // Section 3: Detailed Step-by-Step Operating Instructions (Dynamic Box Sizing)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. STEP-BY-STEP OPERATING INSTRUCTIONS', 14, y);
  y += 3.5;

  spec.stepByStepWorkflows.forEach((wf) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    const wrappedSteps = wf.instructions.map((inst, idx) =>
      doc.splitTextToSize(`${idx + 1}. ${inst}`, 176)
    );
    const totalStepLines = wrappedSteps.reduce((acc, l) => acc + l.length, 0);
    const wfBoxH = totalStepLines * 3.2 + 12.5;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, 182, wfBoxH, 1.5, 1.5, 'FD');

    // Title on Left, Navigation Path right-aligned at x = 193mm so they never collide
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(spec.accentColor[0], spec.accentColor[1], spec.accentColor[2]);
    doc.text(`${wf.stepNumber}: ${wf.workflowTitle}`, 17, y + 4.8);

    doc.setFont('courier', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(wf.navigationPath, 193, y + 4.8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    doc.setTextColor(51, 65, 85);
    let sy = y + 9;
    wrappedSteps.forEach((lines) => {
      doc.text(lines, 17, sy);
      sy += lines.length * 3.2 + 0.4;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(21, 128, 61);
    doc.text(`Expected Result: ${wf.expectedResult}`, 17, sy + 1.2);

    y += wfBoxH + 2.5;
  });

  // Page Footer
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 286, 196, 286);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `LCSCO Inventory Official User Manual — Profile: ${spec.title} (${spec.email})`,
    14,
    290.5
  );
  doc.text('LCSCO Laboratory', 196, 290.5, { align: 'right' });
}

/**
 * Generates and downloads the PDF User Guide for either a single LCSCO role
 * or the Complete 4-Profile Master Manual.
 */
export function downloadLCSCOUserGuidePDF(targetRole?: UserRole | 'ALL'): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  if (!targetRole || targetRole === 'ALL') {
    LCSCO_ROLE_MANUALS.forEach((spec, idx) => {
      renderRoleGuidePage(doc, spec, idx === 0);
    });
    doc.save('LCSCO_Inventory_Complete_4_Profiles_User_Guide.pdf');
  } else {
    // The Secretary shares the Director's full manual; reuse it rather than
    // falling through to the first role by accident.
    const requestedRole = targetRole === UserRole.SECRETARY ? UserRole.ADMIN : targetRole;
    const found =
      LCSCO_ROLE_MANUALS.find((m) => m.role === requestedRole) || LCSCO_ROLE_MANUALS[0];
    renderRoleGuidePage(doc, found, true);
    const cleanName = found.title.toLowerCase().replace(/\s+/g, '_');
    doc.save(`LCSCO_Inventory_${cleanName}_User_Guide.pdf`);
  }
}

export const downloadApplicationGuidePdf = downloadLCSCOUserGuidePDF;
