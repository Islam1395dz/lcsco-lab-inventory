import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  Lock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserRole } from '../types/inventory';
import {
  downloadLCSCOUserGuidePDF,
  LCSCO_ROLE_MANUALS,
  RoleGuideSection,
} from '../utils/pdfGuideGenerator';

const LCSCO_ROLE_MANUALS_EN_REVISED: RoleGuideSection[] = [
  {
    role: UserRole.ADMIN,
    title: '1. DIRECTOR — Full Administrator',
    badge: 'DIRECTOR · FULL ADMINISTRATOR',
    email: 'director@lcsco.dz',
    overview:
      'As the Director, you have full administrative access to the laboratory inventory and system with no restrictions. You oversee all inventory, approve stock adjustments, approve chemical purchases & disposals, manage storage locations, and manage all user accounts and roles.',
    allowedActions: [
      'View, search, filter, add, edit, and archive/remove chemical records',
      'Add, modify, and manage storage locations & view AI co-location alerts',
      'Record stock movements, adjust stock after physical inventory, and approve stock adjustments',
      'Approve chemical disposal requests & view disposal history',
      'Create & approve purchase requests, and receive/validate incoming chemicals',
      'Manage all users: create, edit, activate/deactivate users, and assign/change roles',
      'View complete inventory history, immutable audit logs, statistics, and export CSV reports',
    ],
    restrictedActions: [
      'None — Full administrative access across all modules and workflows.',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'STEP 1',
        workflowTitle: 'Approve Stock Adjustments, Purchases & Disposals',
        navigationPath: 'Navigation Bar -> Dashboard',
        instructions: [
          'Open "Dashboard" to view Pending Approvals across Stock Adjustments, Disposals, and Purchases.',
          'Review Stock Adjustment Requests (Digital vs Physical quantity) submitted by Technicians or Professors and click "Approve & Update Stock".',
          'Approve Purchase Requests (or mark as Ordered) and approve Disposal Requests.',
        ],
        expectedResult:
          'Approved stock adjustments automatically update the bottle balance and record an immutable audit trail entry.',
      },
      {
        stepNumber: 'STEP 2',
        workflowTitle: 'Manage Users, Roles & Account Activation',
        navigationPath: 'Navigation Bar -> Profile',
        instructions: [
          'Click "Profile" in the top navigation bar.',
          'Create new user profiles, assign or change roles (Director, Professor, Technician, PhD Student), or Activate/Deactivate users.',
          'New members must have a Firebase Authentication account for their email (or sign in with Google) before they can access the inventory.',
        ],
        expectedResult:
          'Only the Director can create, edit, activate/deactivate, or remove user profiles.',
      },
      {
        stepNumber: 'STEP 3',
        workflowTitle: 'Full Inventory Control, Archive/Remove & CSV Export',
        navigationPath: 'Navigation Bar -> Reagents & Solvents',
        instructions: [
          'Browse the clean sorted inventory list and click any reagent to open its full details.',
          'Record stock movements, transfer storage boxes, or click "Archive / Remove Record (Director)" when a bottle must be removed.',
          'Click "Export CSV" to export complete inventory data and reports.',
        ],
        expectedResult:
          'Complete administrative traceability over every chemical, location, and user.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 1. DIRECTOR (Full Administrator)',
      activeNav: 'Dashboard',
      highlightBanner:
        'DIRECTOR: Full Inventory + Approve Adjustments/Purchases/Disposals + Manage Users + Archive/Remove Unlocked',
      primaryWidgetTitle: 'Director Approval Center & User Governance',
      primaryWidgetSubtitle:
        'Approve physical stock adjustments, purchase requests, and disposal requests, and manage all user accounts.',
      sampleActionText:
        '[Approve Stock Adjustment]   [Approve Purchase]   [Approve Disposal]   [Manage Users]',
      deleteButtonState: 'ENABLED',
    },
  },
  {
    role: UserRole.PROFESSOR,
    title: '2. PROFESSOR — Supervisor / Research Group Manager',
    badge: 'PROFESSOR · SUPERVISOR',
    email: 'professor@lcsco.dz',
    overview:
      'As a Professor, you supervise research-group inventory, consumption, and safety approvals. You can add/edit chemicals, approve purchase and disposal requests for your group, request inventory corrections, and export reports, but cannot manage users or permanently delete records.',
    allowedActions: [
      'View, search, filter, add new chemicals, and edit chemical information when necessary',
      'View stock quantities and record/use stock for research activities',
      'Create purchase requests & approve purchase requests related to your research group',
      'Approve disposal requests from your research group & view disposal records',
      'Request inventory corrections (Stock Adjustment Requests)',
      'View research-group consumption, low-stock/expiration alerts, and export CSV reports',
    ],
    restrictedActions: [
      'Cannot create, edit, activate/deactivate, or delete users, and cannot change user roles',
      'Cannot permanently delete inventory records (restricted to Director)',
      'Cannot perform unrestricted silent stock adjustments or delete audit history',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'STEP 1',
        workflowTitle: 'Supervise Group Inventory & Approve Purchase / Disposal Requests',
        navigationPath: 'Navigation Bar -> Dashboard',
        instructions: [
          'Open "Dashboard" to view research-group inventory, low-stock items, and expiring items.',
          'In "Disposal Workflow", review disposal requests from PhD Students/Technicians and click "Approve Disposal".',
          'In "Purchase & Delivery Pipeline", create or approve purchase requests for your research group.',
        ],
        expectedResult:
          'Approved disposals are forwarded to the Technician for physical disposal; approved purchases move to Ordered/Delivery.',
      },
      {
        stepNumber: 'STEP 2',
        workflowTitle: 'Add/Edit Chemicals, Record Usage & Request Corrections',
        navigationPath: 'Navigation Bar -> Reagents & Solvents',
        instructions: [
          'Click "Reagents & Solvents" to inspect the sorted list or add a new chemical.',
          'Click any reagent row to view its SDS, placement box, and record research consumption.',
          'If a physical count differs from digital stock, submit a "Stock Adjustment Request" for Director approval.',
        ],
        expectedResult:
          'Every stock usage or correction request is logged in the immutable audit trail.',
      },
      {
        stepNumber: 'STEP 3',
        workflowTitle: 'Export Inventory Reports & Update Your Profile',
        navigationPath: 'Dashboard / Profile',
        instructions: [
          'Click "Export CSV Report" on the Dashboard or Inventory list to download group statistics.',
          'Open "Profile" to edit your display name and profile photo. Your sign-in password is managed securely by Firebase Authentication.',
        ],
        expectedResult:
          'Research-group reports are exported cleanly while user management remains locked to the Director.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 2. PROFESSOR (Supervisor / Research Group Manager)',
      activeNav: 'Dashboard',
      highlightBanner:
        'PROFESSOR: Approve Group Purchases & Disposals + Add/Edit Chemicals + Request Corrections (No Permanent Delete)',
      primaryWidgetTitle: 'Research-Group Approvals & Consumption Supervision',
      primaryWidgetSubtitle:
        'Approve purchase and disposal requests from your group and monitor low-stock/expiring chemicals.',
      sampleActionText:
        '[Approve Purchase Request]   [Approve Disposal Request]   [Request Stock Adjustment]',
      deleteButtonState: 'LOCKED (Director Only)',
    },
  },
  {
    role: UserRole.TECHNICIAN,
    title: '3. LAB ENGINEER — Operational Inventory Manager',
    badge: 'LAB ENGINEER · OPERATIONAL INVENTORY MANAGER',
    email: 'lab.engineer@lcsco.dz',
    overview:
      'As the Lab Engineer, you are responsible for operational inventory management. You register newly received chemicals, manage physical locations (Room → Cabinet → Side → Shelf → Position), perform controlled quantity adjustments with confirmation, create disposal requests, and record approved disposals.',
    allowedActions: [
      'Add/edit chemicals, register newly received bottles, and handle incoming chemical deliveries',
      'Manage physical storage locations (Room → Cabinet → Left/Right Side → Shelf → Position) with safety checks',
      'Record stock additions, chemical consumption, and controlled quantity adjustments (with confirmation dialog)',
      'Mark chemicals as expired/damaged, create disposal requests, and record approved physical disposals',
      'Scan QR/barcodes, print QR labels, and export operational inventory data',
    ],
    restrictedActions: [
      'Cannot overwrite stock quantities without confirmation and mandatory reason',
      'Cannot approve your own disposal requests or approve purchases (requires Professor/Director)',
      'Cannot manage users, change roles, modify system settings, or delete audit/inventory records',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'STEP 1',
        workflowTitle: 'Receive Incoming Deliveries & Assign Physical Locations',
        navigationPath: 'Requests / Reagents',
        instructions: [
          'In "Requests", click "Receive Delivery" on approved/ordered purchases.',
          'Select the physical location using separate dropdowns: Room (204) → Cabinet (FLAM-01) → Side (Left/Right) → Shelf (2) → Position (01) to generate code R204-FLAM01-L-S02-P01.',
        ],
        expectedResult:
          'Received chemicals are validated, assigned a clear physical location, and added to digital stock.',
      },
      {
        stepNumber: 'STEP 2',
        workflowTitle: 'Controlled Quantity Adjustment & Location Transfers',
        navigationPath: 'Reagent Detail View',
        instructions: [
          'On any reagent page, click "Adjust quantity", enter the new quantity and reason (e.g. Physical inventory count), and confirm in the confirmation dialog.',
          'Use "Change location" to move bottles between Room → Cabinet → Side → Shelf → Position.',
        ],
        expectedResult:
          'Every quantity adjustment is confirmed and logged in the immutable audit trail with previous quantity, new quantity, difference, and reason.',
      },
      {
        stepNumber: 'STEP 3',
        workflowTitle: 'Record Approved Physical Disposals & Print QR Labels',
        navigationPath: 'Requests -> Disposals',
        instructions: [
          'When a Professor or Director approves a Disposal Request, click "Confirm Disposed".',
          'Use "View QR Code label" on any reagent page to print solvent-resistant QR codes.',
        ],
        expectedResult:
          'Disposed containers are zeroed out and logged in the disposal and audit history.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 3. LAB ENGINEER (Operational Inventory Manager)',
      activeNav: 'Reagents',
      highlightBanner:
        'LAB ENGINEER: Receive Deliveries + Physical Locations (Room → Cabinet → Side → Shelf → Pos) + Controlled Quantity Adjustments',
      primaryWidgetTitle: 'Operational Inventory, Physical Locations & Quantity Adjustments',
      primaryWidgetSubtitle:
        'Perform confirmed quantity adjustments, manage cabinet compartments (Left/Right), and execute approved disposals.',
      sampleActionText:
        '[Receive Delivery]   [Adjust Quantity (Confirm)]   [Change Physical Location]',
      deleteButtonState: 'LOCKED (Director Only)',
    },
  },
  {
    role: UserRole.STUDENT_RESEARCHER,
    title: '4. PHD STUDENT — Researcher / Inventory User',
    badge: 'PHD STUDENT · RESEARCHER',
    email: 'phd.student@lcsco.dz',
    overview:
      'As a PhD Student, you access the inventory for research purposes without modifying master chemical records. You can view available chemicals and SDS, scan QR codes, record chemical consumption, view your own usage history, create purchase and disposal requests, and report damaged/expired items.',
    allowedActions: [
      'View available inventory, search/filter chemicals, and view chemical details, SDS & storage locations',
      'Scan QR/barcodes and record chemical consumption / stock usage (e.g. 500 mL -> 475 mL | -25 mL)',
      'View your own consumption history on the Dashboard',
      'Create purchase requests for unavailable or low-stock chemicals',
      'Create disposal requests and report damaged or expired chemicals',
      'Receive low-stock and expiration information for your research group',
    ],
    restrictedActions: [
      'Cannot add or edit master chemical information or manage storage locations',
      'Cannot directly overwrite stock quantities or perform stock adjustments',
      'Cannot delete chemicals, approve purchases, or approve disposals',
      'Cannot manage users, change roles, access system settings, or modify audit history',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'STEP 1',
        workflowTitle: 'Find Available Chemicals & Record Consumption',
        navigationPath: 'Navigation Bar -> Reagents & Solvents / Dashboard',
        instructions: [
          'Click "Reagents & Solvents" to search and sort available chemicals, then click a row to see its SDS and storage box.',
          'Enter the quantity consumed (e.g. 25 mL) and your experiment reference, then confirm.',
          'View your personal usage records under "My Consumption History" on the Dashboard.',
        ],
        expectedResult:
          'The movement is recorded as "-25 mL | Chemical used | PhD Student | Date/Time" without overwriting history.',
      },
      {
        stepNumber: 'STEP 2',
        workflowTitle: 'Create Purchase Requests for Unavailable or Low-Stock Chemicals',
        navigationPath: 'Dashboard -> + Purchase Request',
        instructions: [
          'On your Dashboard, click "+ Purchase Request".',
          'Enter the chemical name, CAS, quantity needed, and research justification.',
          'Track your request status (Requested -> Approved -> Ordered -> Received) under "Purchase & Delivery Pipeline".',
        ],
        expectedResult:
          'Your Professor or Director can approve the purchase request, and the Technician will receive it into stock.',
      },
      {
        stepNumber: 'STEP 3',
        workflowTitle: 'Request Disposal or Report Damaged / Expired Chemicals',
        navigationPath: 'Dashboard -> Request Disposal / Reagent Detail',
        instructions: [
          'If a bottle is expired, contaminated, or has a damaged label, click "Request Disposal" on the Dashboard or "Report Identification Problem" on its detail page.',
          'Describe the issue so the container is locked and sent to the Professor/Director for approval.',
        ],
        expectedResult:
          'Hazardous or damaged bottles are safely quarantined and queued for supervised approval.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 4. PHD STUDENT (Researcher / Inventory User)',
      activeNav: 'Dashboard',
      highlightBanner:
        'PHD STUDENT: View Inventory & SDS + Record Consumption + Create Purchase/Disposal Requests',
      primaryWidgetTitle: 'Record Chemical Consumption & My Requests',
      primaryWidgetSubtitle:
        'Every stock usage creates an immutable movement record (500 mL -> 475 mL | -25 mL). Master catalog edits and deletions are locked.',
      sampleActionText:
        'MOVEMENT: 500 mL -> 475 mL (-25 mL | Batch #EXP-88)   [+ Purchase Request]   [Request Disposal]',
      deleteButtonState: 'LOCKED',
    },
  },
];

const LCSCO_ROLE_MANUALS_FR_REVISED: RoleGuideSection[] = [
  {
    role: UserRole.ADMIN,
    title: '1. DIRECTEUR — Administrateur Complet',
    badge: 'DIRECTEUR · ADMINISTRATEUR COMPLET',
    email: 'director@lcsco.dz',
    overview:
      "En tant que Directeur, vous disposez d'un accès administratif complet à l'inventaire et au système, sans aucune restriction. Vous gérez l'inventaire, approuvez les ajustements de stock, les achats et les éliminations, et gérez tous les comptes utilisateurs et leurs rôles.",
    allowedActions: [
      'Voir, rechercher, filtrer, ajouter, modifier et archiver/supprimer les produits chimiques',
      'Ajouter, modifier et gérer les emplacements de stockage & alertes IA de co-localisation',
      'Enregistrer les mouvements de stock, ajuster après inventaire physique et approuver les ajustements',
      'Approuver les demandes d’élimination et consulter l’historique d’élimination',
      'Créer et approuver les demandes d’achat, et valider les livraisons entrantes',
      'Gérer tous les utilisateurs : créer, modifier, activer/désactiver et attribuer/changer les rôles',
      'Consulter l’historique complet, le journal d’audit immuable et exporter les rapports CSV',
    ],
    restrictedActions: [
      'Aucune restriction — Accès administratif complet sur tout le système.',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'ÉTAPE 1',
        workflowTitle: 'Approuver les Ajustements de Stock, Achats & Éliminations',
        navigationPath: 'Barre de Navigation -> Tableau de Bord',
        instructions: [
          'Ouvrez « Tableau de Bord » pour voir toutes les approbations en attente.',
          'Examinez les demandes d’ajustement de stock (Numérique vs Physique) soumises par le Technicien ou Professeur et cliquez sur « Approuver & Mettre à Jour ».',
          'Approuvez les demandes d’achat et les demandes d’élimination.',
        ],
        expectedResult:
          'Les ajustements approuvés mettent à jour le stock et créent une entrée d’audit immuable.',
      },
      {
        stepNumber: 'ÉTAPE 2',
        workflowTitle: 'Gérer les Utilisateurs, les Rôles & l’Activation des Comptes',
        navigationPath: 'Barre de Navigation -> Profil',
        instructions: [
          'Cliquez sur « Profil » dans la barre de navigation supérieure.',
          'Créez de nouveaux utilisateurs, changez leurs rôles (Directeur, Professeur, Technicien, Doctorant) ou activez/désactivez un compte.',
          'Personnalisez votre mot de passe et votre photo de profil.',
        ],
        expectedResult:
          'Seul le Directeur peut créer, modifier, activer/désactiver ou supprimer des profils.',
      },
      {
        stepNumber: 'ÉTAPE 3',
        workflowTitle: 'Contrôle Complet de l’Inventaire, Suppression & Export CSV',
        navigationPath: 'Barre de Navigation -> Réactifs & Solvants',
        instructions: [
          'Parcourez la liste triée et cliquez sur un réactif pour ouvrir sa fiche complète.',
          'Enregistrez un mouvement, transférez une boîte ou cliquez sur « Archiver / Supprimer (Directeur) ».',
          'Cliquez sur « Exporter CSV » pour télécharger les données d’inventaire.',
        ],
        expectedResult:
          'Traçabilité administrative complète sur chaque flacon, boîte et utilisateur.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 1. DIRECTEUR (Administrateur Complet)',
      activeNav: 'Tableau de Bord',
      highlightBanner:
        'DIRECTEUR : Inventaire Complet + Approbations + Gestion Utilisateurs + Suppression Déverrouillée',
      primaryWidgetTitle: 'Centre d’Approbation Directeur & Gouvernance Utilisateurs',
      primaryWidgetSubtitle:
        'Approuvez les ajustements physiques, les achats et les éliminations, et gérez les comptes chercheurs.',
      sampleActionText:
        '[Approuver Ajustement]   [Approuver Achat]   [Approuver Élimination]   [Gérer Utilisateurs]',
      deleteButtonState: 'ENABLED',
    },
  },
  {
    role: UserRole.PROFESSOR,
    title: '2. PROFESSEUR — Superviseur / Responsable de Groupe',
    badge: 'PROFESSEUR · SUPERVISEUR',
    email: 'professor@lcsco.dz',
    overview:
      "En tant que Professeur, vous supervisez l'inventaire et les activités de votre groupe de recherche. Vous pouvez ajouter/modifier des produits, approuver les demandes d'achat et d'élimination du groupe, demander des corrections de stock et exporter des rapports, sans gérer les utilisateurs ni supprimer définitivement des flacons.",
    allowedActions: [
      'Voir, rechercher, filtrer, ajouter de nouveaux réactifs et modifier leurs informations',
      'Consulter les quantités et enregistrer la consommation pour vos activités de recherche',
      'Créer des demandes d’achat et approuver les achats liés à votre groupe de recherche',
      'Approuver les demandes d’élimination de votre groupe et consulter l’historique d’élimination',
      'Demander des corrections d’inventaire (Demandes d’Ajustement de Stock)',
      'Consulter la consommation du groupe, les alertes de stock faible/expiration et exporter les rapports CSV',
    ],
    restrictedActions: [
      'Ne peut ni créer ni supprimer d’utilisateurs, ni modifier les rôles',
      'Ne peut pas supprimer définitivement des enregistrements d’inventaire (réservé au Directeur)',
      'Ne peut pas effectuer d’ajustements de stock sans approbation ni supprimer l’historique d’audit',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'ÉTAPE 1',
        workflowTitle: 'Superviser le Groupe & Approuver les Achats / Éliminations',
        navigationPath: 'Barre de Navigation -> Tableau de Bord',
        instructions: [
          'Ouvrez « Tableau de Bord » pour suivre l’inventaire du groupe, les stocks faibles et les expirations.',
          'Dans « Circuit d’Élimination », approuvez les demandes d’élimination soumises par les Doctorants/Techniciens.',
          'Dans « Circuit d’Achat & Réception », créez ou approuvez les demandes d’achat du groupe.',
        ],
        expectedResult:
          'Les éliminations approuvées sont transmises au Technicien pour exécution physique.',
      },
      {
        stepNumber: 'ÉTAPE 2',
        workflowTitle: 'Ajouter des Réactifs, Consommer & Demander une Correction',
        navigationPath: 'Barre de Navigation -> Réactifs & Solvants',
        instructions: [
          'Cliquez sur « Réactifs & Solvants » pour consulter la liste triée ou ajouter un produit.',
          'Cliquez sur un réactif pour voir sa FDS, sa boîte et enregistrer une consommation.',
          'En cas d’écart de stock, soumettez une « Demande d’Ajustement de Stock » pour approbation par le Directeur.',
        ],
        expectedResult:
          'Chaque utilisation ou demande de correction est tracée dans le journal d’audit.',
      },
      {
        stepNumber: 'ÉTAPE 3',
        workflowTitle: 'Exporter les Rapports & Gérer Votre Profil',
        navigationPath: 'Tableau de Bord / Profil',
        instructions: [
          'Cliquez sur « Exporter Rapport CSV » pour obtenir les statistiques d’inventaire.',
          'Ouvrez « Profil » pour modifier votre mot de passe et votre photo.',
        ],
        expectedResult:
          'Vos rapports scientifiques sont exportés en un clic.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 2. PROFESSEUR (Superviseur de Groupe)',
      activeNav: 'Tableau de Bord',
      highlightBanner:
        'PROFESSEUR : Approbation Achats & Éliminations + Ajout/Édition Réactifs (Suppression Définitive Verrouillée)',
      primaryWidgetTitle: 'Supervision du Groupe de Recherche & Approbations',
      primaryWidgetSubtitle:
        'Approuvez les demandes d’achat et d’élimination du groupe et surveillez les stocks critiques.',
      sampleActionText:
        '[Approuver Achat]   [Approuver Élimination]   [Demander Ajustement de Stock]',
      deleteButtonState: 'LOCKED (Director Only)',
    },
  },
  {
    role: UserRole.TECHNICIAN,
    title: '3. INGÉNIEUR DE LABORATOIRE — Gestionnaire Opérationnel',
    badge: 'INGÉNIEUR LABO · GESTIONNAIRE OPÉRATIONNEL',
    email: 'lab.engineer@lcsco.dz',
    overview:
      "En tant qu'Ingénieur de Laboratoire, vous êtes responsable de la gestion opérationnelle de l'inventaire : réception des livraisons, enregistrement des flacons, gestion des emplacements physiques (Salle → Armoire → Côté Gauche/Droit → Étagère → Position), ajustements contrôlés de quantité avec confirmation et exécution des éliminations approuvées.",
    allowedActions: [
      'Ajouter/modifier des réactifs, enregistrer les flacons reçus et gérer les livraisons entrantes',
      'Gérer les emplacements physiques (Salle → Armoire → Côté Gauche/Droit → Étagère → Position)',
      'Enregistrer les entrées de stock, consommations et ajustements contrôlés de quantité (avec confirmation)',
      'Marquer les produits périmés/endommagés, demander l’élimination et enregistrer l’élimination physique approuvée',
      'Scanner les codes QR, imprimer les étiquettes QR et exporter les données opérationnelles',
    ],
    restrictedActions: [
      'Ne peut pas écraser une quantité sans boîte de dialogue de confirmation et motif obligatoire',
      'Ne peut pas approuver ses propres demandes d’élimination ni approuver les achats',
      'Ne peut pas gérer les utilisateurs, changer les rôles ou supprimer l’historique d’audit',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'ÉTAPE 1',
        workflowTitle: 'Réceptionner les Livraisons & Attribuer l’Emplacement Physique',
        navigationPath: 'Demandes / Réactifs',
        instructions: [
          'Dans « Demandes », cliquez sur « Réceptionner » pour les commandes approuvées.',
          'Sélectionnez Salle (204) → Armoire (FLAM-01) → Côté (Left/Right) → Étagère (2) → Position (01) pour générer le code R204-FLAM01-L-S02-P01.',
        ],
        expectedResult:
          'Les livraisons sont validées et ajoutées au stock avec un emplacement physique clair.',
      },
      {
        stepNumber: 'ÉTAPE 2',
        workflowTitle: 'Ajuster la Quantité (avec Confirmation) & Déplacer un Flacon',
        navigationPath: 'Fiche Réactif',
        instructions: [
          'Sur la fiche d’un réactif, cliquez sur « Ajuster la quantité », saisissez la nouvelle quantité et le motif, puis confirmez.',
          'Utilisez « Modifier emplacement » pour déplacer le flacon entre Salle → Armoire → Côté → Étagère → Position.',
        ],
        expectedResult:
          'Chaque ajustement de quantité est confirmé et enregistré dans l’historique (avant, après, différence, motif).',
      },
      {
        stepNumber: 'ÉTAPE 3',
        workflowTitle: 'Enregistrer l’Élimination Physique Approuvée & Étiquettes QR',
        navigationPath: 'Demandes -> Éliminations',
        instructions: [
          'Lorsqu’une élimination est approuvée par le Professeur/Directeur, cliquez sur « Confirmer élimination ».',
          'Imprimez les étiquettes QR depuis la fiche du réactif.',
        ],
        expectedResult:
          'L’élimination physique est enregistrée avec son code de bordereau déchets.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 3. INGÉNIEUR DE LABORATOIRE (Gestionnaire Opérationnel)',
      activeNav: 'Réactifs',
      highlightBanner:
        'INGÉNIEUR LABO : Livraisons + Emplacements (Salle → Armoire → Côté → Étagère → Pos) + Ajustement Quantité',
      primaryWidgetTitle: 'Gestion Opérationnelle, Emplacements Physiques & Ajustements',
      primaryWidgetSubtitle:
        'Effectuez des ajustements de quantité confirmés, gérez les compartiments Gauche/Droit et exécutez les éliminations.',
      sampleActionText:
        '[Réceptionner]   [Ajuster la quantité (Confirmer)]   [Modifier emplacement]',
      deleteButtonState: 'LOCKED (Director Only)',
    },
  },
  {
    role: UserRole.STUDENT_RESEARCHER,
    title: '4. DOCTORANT — Chercheur / Utilisateur d’Inventaire',
    badge: 'DOCTORANT · CHERCHEUR',
    email: 'phd.student@lcsco.dz',
    overview:
      "En tant que Doctorant, vous accédez à l'inventaire pour vos recherches sans modifier directement les informations maîtresses. Vous consultez les réactifs disponibles et leurs FDS, scannez les QR, enregistrez votre consommation, suivez votre historique et créez des demandes d'achat ou d'élimination.",
    allowedActions: [
      'Voir l’inventaire disponible, rechercher/filtrer et consulter les détails, FDS et boîtes de rangement',
      'Scanner les codes QR et enregistrer votre consommation chimique (ex. 500 mL -> 475 mL | -25 mL)',
      'Consulter votre propre historique de consommation sur le Tableau de Bord',
      'Créer des demandes d’achat pour des réactifs indisponibles ou en stock faible',
      'Créer des demandes d’élimination et signaler des flacons endommagés ou périmés',
      'Recevoir les alertes de stock faible et d’expiration du groupe de recherche',
    ],
    restrictedActions: [
      'Ne peut ni ajouter ni modifier les informations maîtresses des produits ni gérer les emplacements',
      'Ne peut pas écraser directement les quantités ni effectuer d’ajustements de stock',
      'Ne peut pas supprimer de produits, ni approuver les achats ou les éliminations',
      'Ne peut pas gérer les utilisateurs, changer les rôles ou modifier le journal d’audit',
    ],
    stepByStepWorkflows: [
      {
        stepNumber: 'ÉTAPE 1',
        workflowTitle: 'Rechercher un Réactif & Enregistrer une Consommation',
        navigationPath: 'Barre de Navigation -> Réactifs & Solvants / Tableau de Bord',
        instructions: [
          'Cliquez sur « Réactifs & Solvants » pour trier la liste et cliquez sur un réactif pour voir sa FDS et sa boîte.',
          'Saisissez la quantité utilisée (ex. 25 mL) et le motif expérimental, puis validez.',
          'Consultez vos prélèvements dans « Mon Historique de Consommation » sur le Tableau de Bord.',
        ],
        expectedResult:
          'Le mouvement est enregistré sous la forme « -25 mL | Réactif utilisé | Doctorant | Date/Heure ».',
      },
      {
        stepNumber: 'ÉTAPE 2',
        workflowTitle: 'Créer une Demande d’Achat',
        navigationPath: 'Tableau de Bord -> + Demande d’Achat',
        instructions: [
          'Sur votre Tableau de Bord, cliquez sur « + Demande d’Achat ».',
          'Indiquez le nom du produit, le CAS, la quantité souhaitée et la justification scientifique.',
          'Suivez l’avancement (Demandé -> Approuvé -> Commandé -> Reçu) dans « Circuit d’Achat ».',
        ],
        expectedResult:
          'Votre Professeur ou Directeur peut approuver la demande et le Technicien réceptionnera le flacon.',
      },
      {
        stepNumber: 'ÉTAPE 3',
        workflowTitle: 'Demander une Élimination ou Signaler un Flacon Endommagé',
        navigationPath: 'Tableau de Bord -> Demander Élimination / Fiche Réactif',
        instructions: [
          'Si un réactif est périmé ou endommagé, cliquez sur « Demander Élimination » ou « Signaler un Problème ».',
          'Indiquez le motif afin que le flacon soit mis en quarantaine pour validation par le Professeur/Directeur.',
        ],
        expectedResult:
          'Le flacon dangereux est verrouillé et placé dans le circuit d’approbation d’élimination.',
      },
    ],
    screenMockup: {
      windowTitle: 'LCSCO Inventory — 4. DOCTORANT (Chercheur / Utilisateur)',
      activeNav: 'Tableau de Bord',
      highlightBanner:
        'DOCTORANT : Consultation & FDS + Enregistrement Consommation + Demandes d’Achat/Élimination',
      primaryWidgetTitle: 'Enregistrer une Consommation & Suivre Mes Demandes',
      primaryWidgetSubtitle:
        'Chaque consommation crée un mouvement traçable (500 mL -> 475 mL | -25 mL). Les modifications maîtresses sont verrouillées.',
      sampleActionText:
        'MOUVEMENT : 500 mL -> 475 mL (-25 mL | Synthèse #88)   [+ Demande d’Achat]   [Demander Élimination]',
      deleteButtonState: 'LOCKED',
    },
  },
];

export const UserGuideView: React.FC = () => {
  const { profile } = useInventoryContext();
  const { language, tr } = useLanguage();

  const manualsSource =
    language === 'fr' ? LCSCO_ROLE_MANUALS_FR_REVISED : LCSCO_ROLE_MANUALS_EN_REVISED;

  // Strictly match ONLY the currently logged-in profile's guide
  const myManual =
    manualsSource.find((m) => m.role === profile?.role) ||
    manualsSource[0];

  const navTabs =
    language === 'fr'
      ? [
          'Tableau de Bord',
          'Profil',
          'Guide / Mode d’Emploi',
          'Réactifs & Solvants',
          'Calculateur',
          'Étiquettes QR',
        ]
      : [
          'Dashboard',
          'Profile',
          'Guide / How to Use',
          'Reagents & Solvents',
          'Bench Calculator',
          'QR Labels',
        ];

  return (
    <div className="space-y-8">
      {/* Top Header & Direct Role PDF Download */}
      <div className="bg-white border border-slate-200 rounded-md p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-[#1B8A2A] font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {tr('Personalized Role Manual', 'Manuel Personnalisé par Rôle')} · {myManual.badge}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {tr(
              `How to Use LCSCO Inventory — ${myManual.title}`,
              `Mode d’Emploi LCSCO Inventory — ${myManual.title}`
            )}
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            {myManual.overview}
          </p>
        </div>

        <button
          type="button"
          onClick={() => downloadLCSCOUserGuidePDF(myManual.role)}
          className="px-5 py-3 text-xs font-semibold text-white bg-[#1B8A2A] rounded-md hover:bg-emerald-800 transition-colors inline-flex items-center gap-2 shrink-0 cursor-pointer shadow-xs"
        >
          <Download className="w-4 h-4" />
          <span>
            {tr('Download My Role Guide (PDF)', 'Télécharger Mon Guide (PDF)')}
          </span>
        </button>
      </div>

      {/* PART 1: QUICK PERMISSIONS SUMMARY (WHAT YOU CAN & CANNOT DO) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-emerald-200 rounded-md p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 border-b border-emerald-100 pb-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#1B8A2A] shrink-0" />
            <span>
              {tr(
                `Permissions — ${myManual.title}`,
                `Permissions — ${myManual.title}`
              )}
            </span>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            {myManual.allowedActions.map((act: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-bold text-[#1B8A2A] mt-0.5">✓</span>
                <span>{act}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-rose-200 rounded-md p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-900 border-b border-rose-100 pb-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              {tr(
                `Restrictions — ${myManual.title}`,
                `Restrictions — ${myManual.title}`
              )}
            </span>
          </div>
          <ul className="space-y-2 text-xs text-slate-700">
            {myManual.restrictedActions.map((res: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-bold text-rose-600 mt-0.5">✖</span>
                <span>{res}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PART 2: EASY STEP-BY-STEP VISUAL WORKFLOW CARDS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {tr(
                `3 Easy Steps for ${myManual.title}`,
                `3 Étapes Simples pour ${myManual.title}`
              )}
            </h2>
            <p className="text-xs text-slate-500">
              {tr(
                'Follow these step-by-step instructions to perform your daily tasks in LCSCO Inventory.',
                'Suivez ces instructions étape par étape pour effectuer vos opérations quotidiennes dans LCSCO Inventory.'
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {myManual.stepByStepWorkflows.map((wf: any, index: number) => (
            <div
              key={wf.stepNumber}
              className="bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Step Number Badge & Navigation Path */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <span className="px-2.5 py-1 text-xs font-mono font-bold text-white bg-[#1B8A2A] rounded">
                    {tr(`STEP ${index + 1}`, `ÉTAPE ${index + 1}`)}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#1E3A8A] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    {wf.navigationPath}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  {wf.workflowTitle}
                </h3>

                {/* Clear Numbered Sub-steps */}
                <ol className="space-y-2 text-xs text-slate-700 pt-1">
                  {wf.instructions.map((step: any, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-300 text-slate-800 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Expected Result Footer */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded text-xs text-emerald-950 flex items-start gap-2">
                <ArrowRight className="w-4 h-4 text-[#1B8A2A] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{tr('Result: ', 'Résultat : ')}</span>
                  <span>{wf.expectedResult}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PART 3: ANNOTATED INTERFACE SCREENSHOT FOR THIS PROFILE */}
      <section className="bg-white border border-slate-200 rounded-md p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#1B8A2A]" />
            <h2 className="text-base font-bold text-slate-900">
              {tr(
                `Visual Interface Guide — ${myManual.title}`,
                `Aperçu Visuel de l’Interface — ${myManual.title}`
              )}
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-500">
            {tr(
              'This exact diagram is included inside your downloadable PDF',
              'Ce schéma annoté est inclus dans votre manuel PDF téléchargeable'
            )}
          </span>
        </div>

        <div className="border-2 border-slate-800 rounded-md overflow-hidden bg-slate-50">
          {/* Browser Bar */}
          <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-2 font-bold">{myManual.screenMockup.windowTitle}</span>
            </div>
            <span className="text-emerald-400">
              {tr('Active Tab:', 'Onglet Actif :')} {myManual.screenMockup.activeNav}
            </span>
          </div>

          {/* Simulated App Top Navigation Bar */}
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-extrabold text-[#1B8A2A]">LCSCO Inventory</span>
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-medium text-slate-600">
              {navTabs.map((tab) => (
                <span
                  key={tab}
                  className={
                    tab === myManual.screenMockup.activeNav
                      ? 'text-slate-900 font-bold underline underline-offset-4 decoration-2 decoration-[#1B8A2A]'
                      : ''
                  }
                >
                  {tab}
                </span>
              ))}
            </div>
            <span className="font-mono text-[11px] text-slate-600 font-semibold">
              {myManual.badge}
            </span>
          </div>

          {/* Simulated Workspace Body */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4 bg-white border border-slate-200 rounded p-4 space-y-3 text-xs">
              <div className="font-bold text-[#1B8A2A]">
                {tr('Your Active Role Profile', 'Votre Profil Rôle Actif')}
              </div>
              <div className="p-2.5 bg-slate-100 rounded font-mono text-[11px] space-y-1">
                <div>
                  {tr('Role:', 'Rôle :')} <strong>{myManual.title}</strong>
                </div>
                <div>Email: {myManual.email}</div>
                <div>Lab: LCSCO Laboratory</div>
              </div>
              <div className="p-3 bg-slate-900 text-white rounded font-mono text-[11px] space-y-1">
                <div className="text-emerald-400 font-bold">
                  {tr('ENFORCED PERMISSIONS:', 'PERMISSIONS ACTIVES :')}
                </div>
                <div>• {tr('Record Consumption: YES', 'Enregistrer Consommation : OUI')}</div>
                <div>
                  • {tr('Approve Purchases/Disposals:', 'Approuver Achats/Élim. :')}{' '}
                  <strong
                    className={
                      myManual.role === UserRole.ADMIN || myManual.role === UserRole.PROFESSOR
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {myManual.role === UserRole.ADMIN || myManual.role === UserRole.PROFESSOR
                      ? tr('YES', 'OUI')
                      : tr('LOCKED', 'VERROUILLÉ')}
                  </strong>
                </div>
                <div>
                  • {tr('Approve Stock Adjustments:', 'Approuver Ajustements :')}{' '}
                  <strong
                    className={
                      myManual.role === UserRole.ADMIN ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    {myManual.role === UserRole.ADMIN
                      ? tr('DIRECTOR ONLY', 'DIRECTEUR SEUL')
                      : tr('LOCKED', 'VERROUILLÉ')}
                  </strong>
                </div>
                <div>
                  • {tr('Manage Users & Archive Records:', 'Gérer Utilisateurs & Suppr. :')}{' '}
                  <strong
                    className={
                      myManual.role === UserRole.ADMIN ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    {myManual.role === UserRole.ADMIN
                      ? tr('DIRECTOR ONLY', 'DIRECTEUR SEUL')
                      : tr('LOCKED', 'VERROUILLÉ')}
                  </strong>
                </div>
              </div>
            </div>

            <div className="md:col-span-8 space-y-3">
              <div className="p-2.5 bg-[#1B8A2A] text-white rounded text-xs font-mono font-bold">
                {myManual.screenMockup.highlightBanner}
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded space-y-2.5">
                <div className="font-bold text-xs text-slate-900">
                  {myManual.screenMockup.primaryWidgetTitle}
                </div>
                <div className="text-xs text-slate-600">
                  {myManual.screenMockup.primaryWidgetSubtitle}
                </div>
                <div className="p-2.5 bg-slate-900 text-emerald-400 font-mono text-xs rounded">
                  {myManual.screenMockup.sampleActionText}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-[#1E3A8A]">SOL-001</span>{' '}
                  <span className="font-semibold text-slate-900">
                    Acetone (HPLC &gt;=99.9%)
                  </span>
                  <div className="font-mono text-[11px] text-slate-500">
                    {tr('Box FLAM-A · Rm 204 · 1850 mL', 'Boîte FLAM-A · Salle 204 · 1850 mL')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-[#1B8A2A] text-white font-semibold rounded text-[11px]">
                    {tr('- Record Usage', '- Consommer')}
                  </span>
                  {myManual.role === UserRole.ADMIN ? (
                    <span className="px-2.5 py-1 bg-rose-600 text-white font-semibold rounded text-[11px]">
                      {tr('Archive/Remove [Director]', 'Supprimer [Directeur]')}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-slate-200 text-slate-600 font-mono rounded text-[11px] inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>{tr('DELETE LOCKED', 'SUPPR. VERROUILLÉE')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
