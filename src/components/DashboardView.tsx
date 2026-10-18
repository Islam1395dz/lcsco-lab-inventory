import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Info,
  QrCode,
  Repeat,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  ContainerStatus,
  StockRuptureStatus,
} from '../types/inventory';
import {
  formatRoleLabel,
  formatTimestamp,
  TransactionTypeLabel,
} from '../utils/formatters';
import { Button, PageHeader, StatusBadge } from './DesignSystem';

interface DashboardViewProps {
  onSelectContainer: (containerId: string) => void;
  onNavigate: (view: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectContainer,
  onNavigate,
}) => {
  const {
    profile,
    containers,
    products,
    transactions,
    adjustmentRequests,
    disposalRequests,
    purchaseRequests,
    stockRuptureRequests,
    isAdmin,
    isProfessor,
    isTechnician,
    isPhdStudent,
  } = useInventoryContext();

  const { language, tr } = useLanguage();
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const productMap = React.useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  // Core Inventory Metrics
  const totalContainers = containers.length;
  const lowOrNearlyEmpty = containers.filter(
    (c) =>
      c.status === ContainerStatus.LOW_STOCK ||
      c.status === ContainerStatus.NEARLY_EMPTY
  );
  const flaggedContainers = containers.filter(
    (c) =>
      c.status === ContainerStatus.NEEDS_IDENTIFICATION ||
      c.status === ContainerStatus.QUARANTINED
  );

  const nowDate = new Date('2026-10-06T00:00:00Z');
  const expiredOrExpiring = containers.filter((c) => {
    const exp = new Date(c.expiryDate);
    if (isNaN(exp.getTime())) return false;
    const diffDays = (exp.getTime() - nowDate.getTime()) / (1000 * 3600 * 24);
    return diffDays <= 180;
  });

  // Pending Approvals & Active Ruptures
  const pendingAdjustments = adjustmentRequests.filter((a) => a.status === 'PENDING');
  const pendingDisposals = disposalRequests.filter((d) => d.status === 'REQUESTED');
  const pendingPurchases = purchaseRequests.filter((p) => p.status === 'REQUESTED');
  const incomingDeliveries = purchaseRequests.filter(
    (p) => p.status === 'APPROVED' || p.status === 'ORDERED'
  );
  const activeRuptures = stockRuptureRequests.filter(
    (r) =>
      r.status !== StockRuptureStatus.RESOLVED &&
      r.status !== StockRuptureStatus.REJECTED
  );

  const myPurchaseRequests = purchaseRequests.filter(
    (p) => p.requestedByUid === profile?.uid
  );
  const myApprovedPurchases = myPurchaseRequests.filter(
    (p) => p.status === 'APPROVED' || p.status === 'ORDERED'
  );
  const myDisposalRequests = disposalRequests.filter(
    (d) => d.requestedByUid === profile?.uid
  );

  const totalPendingRequests = isPhdStudent
    ? myPurchaseRequests.length + myDisposalRequests.length
    : isTechnician
    ? incomingDeliveries.length + pendingAdjustments.length + activeRuptures.length
    : pendingPurchases.length +
      pendingDisposals.length +
      pendingAdjustments.length +
      activeRuptures.length;

  // Build role-adapted reminders for the personalized Welcome Banner
  const userDisplayName = profile?.fullName || tr('Researcher', 'Chercheur');
  const roleLabel = profile ? formatRoleLabel(profile.role, language) : '';

  const roleReminders = React.useMemo(() => {
    if (isAdmin) {
      return {
        accentBorder: 'border-emerald-200',
        accentBg: 'bg-gradient-to-r from-emerald-50/90 via-white to-teal-50/60',
        badgeBg: 'bg-[#1B8A2A] text-white',
        icon: <ShieldCheck className="w-5 h-5 text-[#1B8A2A]" />,
        greetingTitle: tr(
          `Welcome back, ${userDisplayName}`,
          `Bienvenue, ${userDisplayName}`
        ),
        greetingSubtitle: tr(
          'Director & Laboratory Administrator — Here is your daily governance and inventory status summary:',
          'Directeur du Laboratoire — Voici vos rappels de gouvernance et l’état actuel de l’inventaire :'
        ),
        bullets: [
          {
            type: pendingPurchases.length + pendingDisposals.length + pendingAdjustments.length > 0 ? 'alert' : 'ok',
            text: tr(
              `${pendingPurchases.length} purchase request(s), ${pendingDisposals.length} disposal request(s), and ${pendingAdjustments.length} stock adjustment(s) awaiting your approval.`,
              `${pendingPurchases.length} demande(s) d’achat, ${pendingDisposals.length} demande(s) d’élimination et ${pendingAdjustments.length} ajustement(s) de stock en attente de votre validation.`
            ),
            actionLabel: tr('Review Approvals', 'Gérer les approbations'),
            actionTarget: 'requests',
          },
          {
            type: activeRuptures.length > 0 ? 'alert' : 'info',
            text: tr(
              `${activeRuptures.length} active stock rupture alert(s) and ${lowOrNearlyEmpty.length} low-stock reagent(s) across the laboratory.`,
              `${activeRuptures.length} alerte(s) de rupture active(s) et ${lowOrNearlyEmpty.length} réactif(s) en stock faible dans le laboratoire.`
            ),
            actionLabel: tr('View Reagents', 'Voir les réactifs'),
            actionTarget: 'inventory',
          },
          {
            type: 'info',
            text: tr(
              'Reminder: New accounts you create in Users need a Firebase Authentication account (email/password or Google) — passwords are managed by Firebase and never stored in the inventory database.',
              'Rappel : Les comptes créés dans Utilisateurs reçoivent un mot de passe temporaire qu’ils devront obligatoirement modifier dès leur première connexion.'
            ),
            actionLabel: tr('Manage Users', 'Gérer les utilisateurs'),
            actionTarget: 'users',
          },
        ],
      };
    }

    if (isProfessor) {
      return {
        accentBorder: 'border-blue-200',
        accentBg: 'bg-gradient-to-r from-blue-50/90 via-white to-slate-50/70',
        badgeBg: 'bg-blue-800 text-white',
        icon: <Sparkles className="w-5 h-5 text-blue-700" />,
        greetingTitle: tr(
          `Welcome, Prof. ${userDisplayName.replace(/^(Prof\.|Dr\.)\s*/i, '')}`,
          `Bienvenue, Prof. ${userDisplayName.replace(/^(Prof\.|Dr\.)\s*/i, '')}`
        ),
        greetingSubtitle: tr(
          'Research Supervisor — Key reminders and supervision alerts for your research group today:',
          'Enseignant-Chercheur & Superviseur — Vos rappels et alertes de supervision pour aujourd’hui :'
        ),
        bullets: [
          {
            type: pendingPurchases.length + pendingDisposals.length > 0 ? 'alert' : 'ok',
            text: tr(
              `${pendingPurchases.length} purchase request(s) and ${pendingDisposals.length} disposal request(s) submitted by researchers are awaiting review.`,
              `${pendingPurchases.length} demande(s) d’achat et ${pendingDisposals.length} demande(s) d’élimination soumises par l’équipe sont en attente de révision.`
            ),
            actionLabel: tr('Review Requests', 'Consulter les demandes'),
            actionTarget: 'requests',
          },
          {
            type: activeRuptures.length + flaggedContainers.length > 0 ? 'alert' : 'info',
            text: tr(
              `${activeRuptures.length} critical stockout(s) reported and ${flaggedContainers.length} flagged/quarantined container(s) requiring supervisor attention.`,
              `${activeRuptures.length} rupture(s) critique(s) signalée(s) et ${flaggedContainers.length} flacon(s) verrouillé(s) (quarantaine / étiquette à vérifier) nécessitant une décision.`
            ),
            actionLabel: tr('Inspect Stock', 'Vérifier le stock'),
            actionTarget: 'inventory',
          },
          {
            type: 'info',
            text: tr(
              'Daily reminder: Please remind your PhD students to log every reagent withdrawal and report any discrepancy or illegible label immediately.',
              'Rappel : Encouragez vos doctorants à enregistrer chaque prélèvement et à signaler immédiatement tout écart de quantité ou étiquette endommagée.'
            ),
          },
        ],
      };
    }

    if (isTechnician) {
      return {
        accentBorder: 'border-teal-200',
        accentBg: 'bg-gradient-to-r from-teal-50/90 via-white to-emerald-50/50',
        badgeBg: 'bg-teal-800 text-white',
        icon: <Wrench className="w-5 h-5 text-teal-700" />,
        greetingTitle: tr(
          `Welcome, ${userDisplayName}`,
          `Bienvenue, ${userDisplayName}`
        ),
        greetingSubtitle: tr(
          'Laboratory Engineer — Operational checklist and physical stock reminders for your shift:',
          'Ingénieur de Laboratoire — Vos priorités opérationnelles et rappels de gestion physique du stock :'
        ),
        bullets: [
          {
            type: activeRuptures.length > 0 ? 'alert' : 'ok',
            text: tr(
              `${activeRuptures.length} stock rupture(s) reported by researchers require physical cabinet verification or restocking.`,
              `${activeRuptures.length} rupture(s) de stock signalée(s) par les chercheurs nécessitent une vérification physique dans les armoires ou un réapprovisionnement.`
            ),
            actionLabel: tr('Handle Ruptures', 'Traiter les ruptures'),
            actionTarget: 'requests',
          },
          {
            type: incomingDeliveries.length > 0 ? 'alert' : 'info',
            text: tr(
              `${incomingDeliveries.length} approved order(s) awaiting reception and shelf assignment (Room → Cabinet → Left/Right Side → Shelf → Position).`,
              `${incomingDeliveries.length} commande(s) approuvée(s) en attente de réception et d’affectation physique (Salle → Armoire → Côté G/D → Étagère → Position).`
            ),
            actionLabel: tr('Orders & Reception', 'Commandes & Réception'),
            actionTarget: 'requests',
          },
          {
            type: expiredOrExpiring.length > 0 ? 'alert' : 'info',
            text: tr(
              `Reminder: ${expiredOrExpiring.length} container(s) expire within 6 months. Verify GHS compatibility when placing new bottles and confirm physical counts.`,
              `Rappel : ${expiredOrExpiring.length} flacon(s) expirent sous 6 mois. Vérifiez la compatibilité SGH lors du rangement et validez les quantités lors des contrôles physiques.`
            ),
            actionLabel: tr('Manage Cabinets', 'Gérer les armoires'),
            actionTarget: 'inventory',
          },
        ],
      };
    }

    // Default: PhD Student / Researcher
    return {
      accentBorder: 'border-amber-200',
      accentBg: 'bg-gradient-to-r from-amber-50/80 via-white to-emerald-50/40',
      badgeBg: 'bg-slate-900 text-white',
      icon: <BellRing className="w-5 h-5 text-amber-600" />,
      greetingTitle: tr(
        `Welcome, ${userDisplayName}`,
        `Bienvenue, ${userDisplayName}`
      ),
      greetingSubtitle: tr(
        'PhD Researcher — Essential laboratory reminders before starting your experiments today:',
        'Doctorant / Chercheur — Rappels essentiels avant de démarrer vos manipulations au laboratoire :'
      ),
      bullets: [
        {
          type: 'info',
          text: tr(
            '1. Log every consumption: Always record the exact quantity withdrawn after your experiment and return the bottle to its exact location (CAB X- Level Y- Left/Right side).',
            '1. Enregistrez chaque prélèvement : Déclarez systématiquement la quantité consommée après vos manipulations et replacez le flacon à sa position exacte (CAB X- Level Y- Left/Right side).'
          ),
          actionLabel: tr('Record Consumption', 'Enregistrer un mouvement'),
          actionTarget: 'movements',
        },
        {
          type: 'alert',
          text: tr(
            '2. Report empty or damaged bottles: If a reagent is nearly empty (≤ 10%), out of stock, or has an illegible label, submit a Stock Rupture or Anomaly alert immediately.',
            '2. Signalez les ruptures et anomalies : Si un flacon est presque vide (≤ 10%), épuisé ou présente une étiquette illisible, déclarez immédiatement une Rupture de stock ou une Anomalie.'
          ),
          actionLabel: tr('Browse Reagents', 'Voir les réactifs'),
          actionTarget: 'inventory',
        },
        {
          type: myApprovedPurchases.length > 0 ? 'ok' : 'info',
          text: tr(
            `3. Your requests: You currently have ${myPurchaseRequests.length} purchase request(s) (${myApprovedPurchases.length} approved/ordered) and ${myDisposalRequests.length} disposal request(s).`,
            `3. Suivi de vos demandes : Vous avez ${myPurchaseRequests.length} demande(s) d’achat (${myApprovedPurchases.length} approuvée(s)/commandée(s)) et ${myDisposalRequests.length} demande(s) d’élimination.`
          ),
          actionLabel: tr('My Requests', 'Mes demandes'),
          actionTarget: 'requests',
        },
      ],
    };
  }, [
    isAdmin,
    isProfessor,
    isTechnician,
    userDisplayName,
    tr,
    pendingPurchases.length,
    pendingDisposals.length,
    pendingAdjustments.length,
    activeRuptures.length,
    lowOrNearlyEmpty.length,
    flaggedContainers.length,
    incomingDeliveries.length,
    expiredOrExpiring.length,
    myPurchaseRequests.length,
    myApprovedPurchases.length,
    myDisposalRequests.length,
  ]);

  return (
    <div className="space-y-6">
      {/* Personalized Welcome & Role Reminders Banner */}
      {!welcomeDismissed ? (
        <div
          className={`rounded-xl border ${roleReminders.accentBorder} ${roleReminders.accentBg} p-5 shadow-2xs transition-all`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs shrink-0 mt-0.5">
                {roleReminders.icon}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    {roleReminders.greetingTitle}
                  </h2>
                  {roleLabel && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${roleReminders.badgeBg}`}
                    >
                      {roleLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-600">
                  {roleReminders.greetingSubtitle}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setWelcomeDismissed(true)}
              title={tr('Hide reminders for now', 'Masquer les rappels')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-4 pt-3.5 border-t border-slate-200/70 grid grid-cols-1 md:grid-cols-3 gap-3">
            {roleReminders.bullets.map((item, idx) => (
              <div
                key={idx}
                className="bg-white/90 border border-slate-200/80 rounded-lg p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                  {item.type === 'alert' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : item.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  )}
                  <span>{item.text}</span>
                </div>
                {item.actionLabel && item.actionTarget && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onNavigate(item.actionTarget)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B8A2A] hover:underline cursor-pointer"
                    >
                      <span>{item.actionLabel}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setWelcomeDismissed(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:text-slate-900 shadow-2xs cursor-pointer"
          >
            <BellRing className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {tr(
                `Show welcome reminders for ${userDisplayName}`,
                `Afficher les rappels de bienvenue (${userDisplayName})`
              )}
            </span>
          </button>
        </div>
      )}

      {/* Clean Page Header with Role Context & Focused Primary Action */}
      <PageHeader
        title={
          isAdmin
            ? tr('Laboratory Overview', 'Vue d’ensemble du laboratoire')
            : isProfessor
            ? tr('Supervision & Research Group', 'Supervision & Groupe de recherche')
            : isTechnician
            ? tr('Inventory Operations', 'Opérations d’inventaire')
            : tr('Researcher Workspace', 'Espace chercheur')
        }
        subtitle={`${profile?.fullName || ''} · ${
          profile ? formatRoleLabel(profile.role, language) : ''
        }`}
        actions={
          <>
            <Button variant="secondary" onClick={() => onNavigate('movements')}>
              <Repeat className="w-3.5 h-3.5 text-slate-600" />
              <span>{tr('Record Movement', 'Enregistrer un mouvement')}</span>
            </Button>
            <Button variant="secondary" onClick={() => onNavigate('requests')}>
              <ClipboardList className="w-3.5 h-3.5 text-slate-600" />
              <span>{tr('New Request', 'Nouvelle demande')}</span>
            </Button>
            <Button variant="primary" onClick={() => onNavigate('scanner')}>
              <QrCode className="w-3.5 h-3.5" />
              <span>{tr('Scan QR', 'Scanner QR')}</span>
            </Button>
          </>
        }
      />

      {/* 4 Focused Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-slate-400 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {tr('Active Reagents & Solvents', 'Réactifs & solvants actifs')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {totalContainers}
            </span>
            <span className="text-xs text-slate-500">
              {products.length} {tr('catalog references', 'références')}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-amber-400 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {tr('Low Stock & Ruptures', 'Stock faible & ruptures')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-amber-700">
              {lowOrNearlyEmpty.length + activeRuptures.length}
            </span>
            <span className="text-xs text-slate-500">
              {activeRuptures.length} {tr('rupture reports', 'ruptures signalées')}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-orange-400 transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {tr('Expiration Alerts', 'Alertes d’expiration')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-orange-700">
              {expiredOrExpiring.length}
            </span>
            <span className="text-xs text-slate-500">
              {tr('<= 6 months', '<= 6 mois')}
            </span>
          </div>
        </div>

        <div
          onClick={() => onNavigate('requests')}
          className="bg-white border border-slate-200 rounded-md p-4 hover:border-[#1B8A2A] transition-colors cursor-pointer"
        >
          <div className="text-xs font-medium text-slate-500">
            {isPhdStudent
              ? tr('My Open Requests', 'Mes demandes en cours')
              : isTechnician
              ? tr('Operational Tasks', 'Tâches opérationnelles')
              : tr('Pending Approvals', 'Demandes en attente')}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#1B8A2A]">
              {totalPendingRequests}
            </span>
            <span className="text-xs text-[#1B8A2A] font-medium inline-flex items-center gap-1">
              <span>{tr('Review', 'Consulter')}</span>
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Split: Priority Alerts & Approvals vs Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Priority Alerts & Pending Requests */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {tr('Priority Alerts & Pending Requests', 'Alertes prioritaires & demandes en attente')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('requests')}
              className="text-xs font-medium text-[#1B8A2A] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('View all requests', 'Voir toutes les demandes')}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 text-xs">
            {/* Active Stock Ruptures */}
            {activeRuptures.slice(0, 3).map((rup) => (
              <div
                key={rup.ruptureId}
                onClick={() => onNavigate('requests')}
                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">
                      {rup.chemicalName}
                    </span>
                    <span className="font-mono text-slate-500">({rup.containerId})</span>
                  </div>
                  <p className="text-slate-500 truncate">
                    {tr('Stock rupture reported by', 'Rupture signalée par')}{' '}
                    {rup.reportedByName} · {rup.comment || tr('Urgent check', 'Vérification requise')}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={rup.status} />
                </div>
              </div>
            ))}

            {/* Low Stock Bottles */}
            {lowOrNearlyEmpty.slice(0, 3).map((c) => {
              const prod = productMap.get(c.productId);
              return (
                <div
                  key={c.containerId}
                  onClick={() => onSelectContainer(c.containerId)}
                  className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-semibold text-slate-900 truncate">
                        {prod?.chemicalName || c.productId}
                      </span>
                      <span className="font-mono text-slate-500">({c.containerId})</span>
                    </div>
                    <p className="text-slate-500 font-mono">
                      {tr('Remaining:', 'Restant :')} {c.currentQuantity} / {c.initialQuantity}{' '}
                      {c.unit} · {c.location.code || `${c.location.unit}- Level ${c.location.shelf}- ${c.location.side} side`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={c.status} expiryDate={c.expiryDate} />
                  </div>
                </div>
              );
            })}

            {/* Pending Purchase Requests */}
            {pendingPurchases.slice(0, 2).map((pur) => (
              <div
                key={pur.purchaseId}
                onClick={() => onNavigate('requests')}
                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {tr('Purchase Request:', 'Demande d’achat :')} {pur.chemicalName} (
                    {pur.requestedQuantity} {pur.unit})
                  </div>
                  <p className="text-slate-500 truncate">
                    {pur.requestedByName} · {pur.reason}
                  </p>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={pur.status} />
                </div>
              </div>
            ))}

            {activeRuptures.length === 0 &&
              lowOrNearlyEmpty.length === 0 &&
              pendingPurchases.length === 0 && (
                <div className="p-6 text-center text-slate-500">
                  {tr(
                    'All stock levels and requests are nominal.',
                    'Tous les niveaux de stock et demandes sont normaux.'
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Right Column (5 cols): Recent Stock Movements */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {tr('Recent Stock Movements', 'Mouvements récents')}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-[#1B8A2A] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{tr('Full history', 'Tout l’historique')}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100 text-xs">
            {transactions.slice(0, 5).map((tx) => {
              const prod = productMap.get(tx.productId);
              return (
                <div
                  key={tx.transactionId}
                  onClick={() => onSelectContainer(tx.containerId)}
                  className="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-[#1E3A8A]">
                        {tx.containerId}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-slate-900 truncate">
                        {prod?.chemicalName || tx.productId}
                      </span>
                    </div>
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        tx.quantityChange < 0
                          ? 'text-amber-700'
                          : tx.quantityChange > 0
                          ? 'text-emerald-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {tx.quantityChange > 0 ? `+${tx.quantityChange}` : tx.quantityChange}{' '}
                      {tx.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <TransactionTypeLabel type={tx.type} />
                    <span className="font-mono">
                      {tx.userName.split('(')[0].trim()} ·{' '}
                      {formatTimestamp(tx.timestamp).split(',')[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
