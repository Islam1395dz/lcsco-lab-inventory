/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Eye,
  EyeOff,
  FlaskConical,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Repeat,
  Settings,
  ShieldCheck,
  UserCircle,
  X,
} from 'lucide-react';
import { AuthAndInventoryProvider, useInventoryContext } from './context/AuthContext';
import {
  LanguageProvider,
  useLanguage,
} from './context/LanguageContext';
import { DashboardView } from './components/DashboardView';
import { InventoryTableView } from './components/InventoryTableView';
import { MovementsView } from './components/MovementsView';
import { RequestsView } from './components/RequestsView';
import { QRScannerView } from './components/QRScannerView';
import { HistoryView } from './components/HistoryView';
import { ContainerDetailView } from './components/ContainerDetailView';
import { UserManagementView } from './components/UserManagementView';
import { SettingsView } from './components/SettingsView';
import { CatalogAndAdminView } from './components/CatalogAndAdminView';
import { AuthenticationPage } from './components/AuthenticationPage';
import { NotificationCenter } from './components/NotificationCenter';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LCSCOLogo } from './components/LCSCOLogo';
import { formatRoleLabel } from './utils/formatters';

export type AppRoute =
  | 'dashboard'   // Accueil
  | 'inventory'   // Réactifs
  | 'movements'   // Mouvements
  | 'requests'    // Demandes
  | 'scanner'     // Scanner
  | 'history'     // Historique
  | 'users'       // Utilisateurs (Director only)
  | 'settings'    // Paramètres
  | 'container';  // Detail view

const TrialModeBanner: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="print:hidden w-full bg-amber-50/95 backdrop-blur-xs border-b border-amber-200/80 text-amber-950 px-3 sm:px-6 py-1.5"
  >
    <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-center">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      <p className="text-[11px] sm:text-xs font-medium leading-snug tracking-tight text-amber-900">
        MODE TEST — Cette application est actuellement en phase d’essai. Les données peuvent être modifiées ou supprimées pendant le développement.
      </p>
    </div>
  </div>
);

const MainShell: React.FC = () => {
  const {
    firebaseUser,
    profile,
    isPreviewMode,
    authReady,
    error,
    clearError,
    signOut,
    isAdmin,
  } = useInventoryContext();
  const { language, toggleLanguage, tr } = useLanguage();

  const [activeRoute, setActiveRoute] = useState<AppRoute>('dashboard');
  const [selectedContainerId, setSelectedContainerId] = useState<string>('SOL-001');
  const [settingsSection, setSettingsSection] = useState<
    'PROFILE' | 'LOCATIONS' | 'LABELS' | 'CALCULATOR' | 'GUIDE'
  >('PROFILE');
  const [labelPrintIds, setLabelPrintIds] = useState<string[] | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const hash = window.location.hash;
      const path = window.location.pathname;
      if (hash.startsWith('#/container/')) {
        const cid = decodeURIComponent(hash.replace('#/container/', '')).trim().toUpperCase();
        if (cid) {
          setSelectedContainerId(cid);
          setActiveRoute('container');
        }
      } else if (path.startsWith('/container/')) {
        const cid = decodeURIComponent(path.replace('/container/', '')).trim().toUpperCase();
        if (cid) {
          setSelectedContainerId(cid);
          setActiveRoute('container');
        }
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  const navigateToContainer = (containerId: string) => {
    const cleanId = containerId.trim().toUpperCase();
    setSelectedContainerId(cleanId);
    setActiveRoute('container');
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    try {
      window.location.hash = `/container/${cleanId}`;
    } catch {
      // Ignore hash restrictions
    }
  };

  const navigateToRoute = (route: Exclude<AppRoute, 'container'>) => {
    setActiveRoute(route);
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    try {
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch {
      // Ignore history API restrictions
    }
  };

  const handlePrintLabels = (ids: string[]) => {
    setLabelPrintIds(ids);
    setSettingsSection('LABELS');
    navigateToRoute('settings');
  };

  const handleOpenCalculator = () => {
    setSettingsSection('CALCULATOR');
    navigateToRoute('settings');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="sticky top-0 z-40 w-full">
          <TrialModeBanner />
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <LCSCOLogo size="lg" />
            </div>
            <div className="font-mono text-xs text-slate-500">
              {tr('Initializing LCSCO Inventory...', 'Initialisation de LCSCO Inventaire...')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser && !isPreviewMode) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="sticky top-0 z-40 w-full">
          <TrialModeBanner />
        </div>
        <div className="flex-1 flex flex-col">
          <AuthenticationPage />
        </div>
      </div>
    );
  }

  // A signed-in user whose profile has not been provisioned (or whose profile
  // listener is still loading) waits on a neutral screen. Profiles are
  // provisioned by the Director; roles are never self-assigned.
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        <div className="sticky top-0 z-40 w-full">
          <TrialModeBanner />
        </div>
        <div className="flex-1 flex flex-col justify-center items-center p-6">
          <div className="text-center space-y-3 max-w-sm">
            <div className="flex justify-center">
              <LCSCOLogo size="lg" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              {tr('Profile Loading', 'Chargement du profil')}
            </h1>
            <p className="text-xs text-slate-500">
              {tr(
                'Your laboratory profile is being prepared. If this screen persists, ask the Director to add you in the Users administration screen.',
                'Votre profil de laboratoire est en cours de préparation. Si cet écran persiste, demandez au Directeur de vous ajouter depuis l’écran Utilisateurs.'
              )}
            </p>
            <button
              type="button"
              onClick={() => signOut()}
              className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
            >
              {tr('Sign Out', 'Se déconnecter')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const savedAvatar =
    profile?.avatarUrl ||
    (profile?.uid ? localStorage.getItem(`lcsco_avatar_${profile.uid}`) : null);

  const navItems: {
    id: Exclude<AppRoute, 'container'>;
    label: string;
    icon: React.FC<{ className?: string }>;
    visible: boolean;
  }[] = [
    {
      id: 'dashboard',
      label: tr('Home', 'Accueil'),
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: 'inventory',
      label: tr('Reagents', 'Réactifs'),
      icon: FlaskConical,
      visible: true,
    },
    {
      id: 'movements',
      label: tr('Movements', 'Mouvements'),
      icon: Repeat,
      visible: true,
    },
    {
      id: 'requests',
      label: tr('Requests', 'Demandes'),
      icon: ClipboardList,
      visible: true,
    },
    {
      id: 'scanner',
      label: tr('Scanner', 'Scanner'),
      icon: QrCode,
      visible: true,
    },
    {
      id: 'history',
      label: tr('History', 'Historique'),
      icon: Clock,
      visible: true,
    },
    {
      id: 'users',
      label: tr('Users', 'Utilisateurs'),
      icon: ShieldCheck,
      visible: isAdmin, // Role-adapted: PhD student, Professor, and Technician do not see Users admin
    },
    {
      id: 'settings',
      label: tr('Settings', 'Paramètres'),
      icon: Settings,
      visible: true,
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col w-full text-slate-900">
      {/* STICKY TOP BAR: Fixed Trial-Mode Banner + Main Header */}
      <div className="print:hidden sticky top-0 z-30 w-full">
        <TrialModeBanner />

        {/* SIMPLIFIED HEADER: LCSCO Inventaire | Primary Navigation | Notifications | User profile ▾ */}
        <header className="w-full bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => navigateToRoute('dashboard')}
            className="flex items-center gap-2.5 text-left cursor-pointer shrink-0"
          >
            <LCSCOLogo size="sm" />
            <span className="text-base font-bold tracking-tight text-slate-900">
              {tr('LCSCO Inventory', 'LCSCO Inventaire')}
            </span>
          </button>

          {/* Zone 2: Clean Role-Adapted Navigation Links */}
          <nav className="hidden lg:flex items-center gap-5 text-xs font-medium text-slate-600">
            {visibleNavItems.map((item) => {
              const isActive =
                activeRoute === item.id ||
                (item.id === 'inventory' && activeRoute === 'container');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'settings') {
                      setSettingsSection('PROFILE');
                    }
                    navigateToRoute(item.id);
                  }}
                  className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'text-slate-900 font-semibold underline underline-offset-8 decoration-2 decoration-[#1B8A2A]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Notifications | User Profile Dropdown ▾ | Mobile Menu */}
          <div className="flex items-center gap-2.5 shrink-0">
            <NotificationCenter
              onSelectContainer={navigateToContainer}
              onNavigateDashboard={() => navigateToRoute('dashboard')}
              onNavigateRequests={() => navigateToRoute('requests')}
            />

            {/* User Profile Dropdown Menu (Profile, Preferences, Language, Logout) */}
            {profile && (
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-[10px] overflow-hidden shrink-0">
                    {savedAvatar ? (
                      <img
                        src={savedAvatar}
                        alt={profile.fullName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span>{profile.fullName.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium text-slate-800 max-w-[120px] truncate">
                    {profile.fullName}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {profileMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1.5 z-50 text-xs">
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <div className="font-semibold text-slate-900 truncate">
                        {profile.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {formatRoleLabel(profile.role, language)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSettingsSection('PROFILE');
                        navigateToRoute('settings');
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <UserCircle className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tr('Profile', 'Profil')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSettingsSection('LOCATIONS');
                        navigateToRoute('settings');
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>{tr('Preferences & Tools', 'Préférences & Outils')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        toggleLanguage();
                        setProfileMenuOpen(false);
                      }}
                      className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        <span>{tr('Language', 'Langue')}</span>
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-[#1B8A2A]">
                        {language === 'fr' ? 'FR → EN' : 'EN → FR'}
                      </span>
                    </button>

                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          signOut();
                        }}
                        className="w-full px-3.5 py-2 text-left text-rose-700 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{tr('Sign Out', 'Déconnexion')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle Menu"
              className="lg:hidden p-2 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Collapsible Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-2 gap-1.5">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeRoute === item.id ||
                  (item.id === 'inventory' && activeRoute === 'container');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'settings') {
                        setSettingsSection('PROFILE');
                      }
                      navigateToRoute(item.id);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        </header>
      </div>

      {/* Main Content Container with Generous Whitespace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 lg:pb-12">
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="font-mono underline ml-4 cursor-pointer"
            >
              {tr('Dismiss', 'Fermer')}
            </button>
          </div>
        )}

        {activeRoute === 'dashboard' && (
          <DashboardView
            onSelectContainer={navigateToContainer}
            onNavigate={(r) => {
              if (r === 'calculator') {
                handleOpenCalculator();
              } else if (r === 'labels') {
                handlePrintLabels([]);
              } else {
                navigateToRoute(r);
              }
            }}
          />
        )}

        {activeRoute === 'inventory' && (
          <InventoryTableView
            onSelectContainer={navigateToContainer}
            onOpenAddModal={() => setShowAddModal(true)}
          />
        )}

        {activeRoute === 'movements' && (
          <MovementsView
            onSelectContainer={navigateToContainer}
            onOpenCalculator={handleOpenCalculator}
          />
        )}

        {activeRoute === 'requests' && (
          <RequestsView onSelectContainer={navigateToContainer} />
        )}

        {activeRoute === 'scanner' && (
          <QRScannerView onScanSuccess={navigateToContainer} />
        )}

        {activeRoute === 'history' && (
          <HistoryView onSelectContainer={navigateToContainer} />
        )}

        {activeRoute === 'users' && <UserManagementView />}

        {activeRoute === 'settings' && (
          <SettingsView
            initialSection={settingsSection}
            labelPrintIds={labelPrintIds}
          />
        )}

        {activeRoute === 'container' && (
          <ContainerDetailView
            containerId={selectedContainerId}
            onBack={() => navigateToRoute('inventory')}
            onSelectContainer={navigateToContainer}
          />
        )}

        <CatalogAndAdminView
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSelectContainer={navigateToContainer}
        />
      </main>

      <OfflineIndicator />

      {/* Mobile Bottom Navigation Bar (5 core laboratory destinations) */}
      <nav className="print:hidden lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 h-14">
        <button
          type="button"
          onClick={() => navigateToRoute('dashboard')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'dashboard' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>{tr('Home', 'Accueil')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('inventory')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'inventory' || activeRoute === 'container'
              ? 'text-[#1B8A2A] font-semibold'
              : 'text-slate-600'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span>{tr('Reagents', 'Réactifs')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('movements')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'movements' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>{tr('Movements', 'Mouvements')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('requests')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'requests' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>{tr('Requests', 'Demandes')}</span>
        </button>

        <button
          type="button"
          onClick={() => navigateToRoute('scanner')}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
            activeRoute === 'scanner' ? 'text-[#1B8A2A] font-semibold' : 'text-slate-600'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>{tr('Scanner', 'Scanner')}</span>
        </button>
      </nav>
    </div>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthAndInventoryProvider>
        <MainShell />
      </AuthAndInventoryProvider>
    </LanguageProvider>
  );
}
