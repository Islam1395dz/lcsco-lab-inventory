import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  FileDown,
  Globe,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { updateOwnUserProfile } from '../services/inventoryService';
import { parseDisplayError } from '../firebase';
import { formatRoleLabel, formatTimestamp } from '../utils/formatters';
import { useLanguage } from '../context/LanguageContext';
import { downloadApplicationGuidePdf } from '../utils/pdfGuideGenerator';
import {
  PermissionAction,
  PhysicalLocationConfig,
  STORAGE_CLASSIFICATIONS,
} from '../types/inventory';
import { Badge, Button, Modal, PageHeader } from './DesignSystem';

export interface SettingsViewProps {
  initialSection?: 'CALCULATOR' | 'GUIDE' | 'LABELS' | 'LOCATIONS' | 'PROFILE';
  labelPrintIds?: string[];
}

export const SettingsView: React.FC<SettingsViewProps> = () => {
  const {
    profile,
    isPreviewMode,
    updatePreviewState,
    containers,
    products,
    physicalLocations,
    savePhysicalLocation,
    deletePhysicalLocation,
    resetDemoInventory,
    clearDemoInventory,
    canPerform,
  } = useInventoryContext();
  const { language, setLanguage } = useLanguage();
  const isFr = language === 'fr';

  const canManageLocations = canPerform(PermissionAction.MANAGE_STORAGE_LOCATIONS);

  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Physical Location Modal State
  const [editingLoc, setEditingLoc] = useState<PhysicalLocationConfig | null>(null);
  const [locRoom, setLocRoom] = useState('204');
  const [locCabinet, setLocCabinet] = useState('FLAM-01');
  const [locLabel, setLocLabel] = useState('Flammable Cabinet');
  const [locStorageClass, setLocStorageClass] = useState<string>('Flammable solvent');
  const [locShelves, setLocShelves] = useState('1, 2, 3, 4');
  const [locPositions, setLocPositions] = useState('01, 02, 03, 04, 05, 06');

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
    }
  }, [profile]);

  if (!profile) return null;

  const demoCount = containers.filter((c) => c.isDemoData).length;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (isPreviewMode) {
        updatePreviewState({
          currentProfile: {
            fullName: fullName.trim(),
            laboratoryIds: ['LCSCO'],
            lastLogin: new Date().toISOString(),
          },
        });
      } else {
        await updateOwnUserProfile({
          uid: profile.uid,
          fullName,
          laboratoryIds: ['LCSCO'],
        });
      }
      setMessage({
        type: 'success',
        text: isFr
          ? 'Paramètres du profil enregistrés avec succès.'
          : 'Account settings saved.',
      });
    } catch (err) {
      setMessage({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSaving(false);
    }
  };

  const openLocationModal = (cfg?: PhysicalLocationConfig) => {
    if (cfg) {
      setEditingLoc(cfg);
      setLocRoom(cfg.room);
      setLocCabinet(cfg.cabinet);
      setLocLabel(cfg.cabinetLabel);
      setLocStorageClass(cfg.storageClassification);
      setLocShelves(cfg.shelves.join(', '));
      setLocPositions(cfg.positions.join(', '));
    } else {
      setEditingLoc({
        id: `CAB-${Date.now().toString(36).toUpperCase()}`,
        room: '204',
        cabinet: 'CAB-03',
        cabinetLabel: 'Synthesis Storage Cabinet',
        storageClassification: 'General synthesis cabinet',
        sides: ['Left', 'Right'],
        shelves: ['1', '2', '3', '4'],
        positions: ['01', '02', '03', '04', '05', '06'],
      });
      setLocRoom('204');
      setLocCabinet('CAB-03');
      setLocLabel('Synthesis Storage Cabinet');
      setLocStorageClass('General synthesis cabinet');
      setLocShelves('1, 2, 3, 4');
      setLocPositions('01, 02, 03, 04, 05, 06');
    }
  };

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    const shelves = locShelves
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const positions = locPositions
      .split(',')
      .map((p) => p.trim().padStart(2, '0'))
      .filter(Boolean);

    savePhysicalLocation(
      {
        id: editingLoc.id,
        room: locRoom.trim() || '204',
        cabinet: locCabinet.trim().toUpperCase() || 'CAB-01',
        cabinetLabel: locLabel.trim() || 'Storage Cabinet',
        storageClassification: locStorageClass,
        sides: ['Left', 'Right'],
        shelves: shelves.length > 0 ? shelves : ['1', '2', '3'],
        positions: positions.length > 0 ? positions : ['01', '02', '03', '04'],
      },
      editingLoc.cabinet,
      editingLoc.room
    );
    setEditingLoc(null);
    setMessage({
      type: 'success',
      text: isFr
        ? `Emplacement physique enregistré : Salle ${locRoom} → Armoire ${locCabinet.toUpperCase()} (Côtés Gauche & Droit).`
        : `Physical location saved: Room ${locRoom} → Cabinet ${locCabinet.toUpperCase()} (Left & Right sides).`,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title={isFr ? 'Paramètres & Configuration du Laboratoire' : 'Settings & Laboratory Configuration'}
        subtitle={
          isFr
            ? 'Préférences personnelles, gestion des emplacements physiques (Salle → Armoire → Côté → Étagère → Position) et données de démonstration.'
            : 'Personal preferences, physical storage locations (Room → Cabinet → Side → Shelf → Position), and demo inventory management.'
        }
      />

      {message && (
        <div
          className={`px-4 py-3 rounded-lg border text-sm flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-xs font-medium underline ml-4"
          >
            {isFr ? 'Fermer' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Section 1: Physical Storage Locations (Room -> Cabinet -> Side -> Shelf -> Position) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" />
              <h2 className="text-base font-semibold text-slate-900">
                {isFr
                  ? 'Emplacements Physiques du Laboratoire (Salle → Armoire → Côté → Étagère → Position)'
                  : 'Physical Laboratory Locations (Room → Cabinet → Side → Shelf → Position)'}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isFr
                ? 'Chaque armoire possède des compartiments Gauche (Left) et Droit (Right) séparés. Exemple de code généré : R204-FLAM01-L-S02-P01.'
                : 'Every cabinet has separate Left and Right physical compartments. Example generated code: R204-FLAM01-L-S02-P01.'}
            </p>
          </div>
          {canManageLocations && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => openLocationModal()}
            >
              {isFr ? 'Ajouter une armoire' : 'Add location / cabinet'}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">{isFr ? 'Salle' : 'Room'}</th>
                <th className="py-2.5 px-4">{isFr ? 'Armoire' : 'Cabinet'}</th>
                <th className="py-2.5 px-4">{isFr ? 'Côtés séparés' : 'Separate Sides'}</th>
                <th className="py-2.5 px-4">{isFr ? 'Étagères' : 'Shelves'}</th>
                <th className="py-2.5 px-4">{isFr ? 'Positions' : 'Positions'}</th>
                {canManageLocations && (
                  <th className="py-2.5 px-4 text-right">{isFr ? 'Actions' : 'Actions'}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {physicalLocations.map((loc) => (
                <tr key={loc.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                    Room {loc.room}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-slate-900">{loc.cabinet}</div>
                    <div className="text-xs text-slate-500">{loc.cabinetLabel}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="teal">Left</Badge>
                      <Badge variant="info">Right</Badge>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">
                    Shelf {loc.shelves.join(', ')}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">
                    Pos {loc.positions.join(', ')}
                  </td>
                  {canManageLocations && (
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLocationModal(loc)}
                      >
                        {isFr ? 'Modifier' : 'Edit'}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Demo Inventory Data Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-700" />
            <h2 className="text-base font-semibold text-slate-900">
              {isFr ? 'Données d’inventaire DEMO' : 'Demo Inventory Dataset'}
            </h2>
            <Badge variant="neutral">
              {demoCount} {isFr ? 'réactifs DEMO' : 'DEMO items'} / {containers.length}{' '}
              {isFr ? 'total' : 'total'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isFr
              ? 'Les données de démonstration sont clairement marquées en interne (isDemoData) afin de pouvoir être restaurées ou supprimées à tout moment.'
              : 'Sample chemicals across all 24 chemical classifications are internally marked as DEMO data so they can be restored for testing or cleared when entering real inventory.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => {
              resetDemoInventory();
              setMessage({
                type: 'success',
                text: isFr
                  ? 'Données DEMO et emplacements physiques restaurés avec succès.'
                  : 'Realistic DEMO inventory and physical locations restored.',
              });
            }}
          >
            {isFr ? 'Restaurer les données DEMO' : 'Restore DEMO data'}
          </Button>
          {demoCount > 0 && (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => {
                clearDemoInventory();
                setMessage({
                  type: 'success',
                  text: isFr
                    ? 'Toutes les données DEMO ont été retirées. Seul votre inventaire réel est conservé.'
                    : 'All DEMO items cleared. Only real laboratory inventory remains.',
                });
              }}
            >
              {isFr ? 'Effacer uniquement les données DEMO' : 'Clear DEMO data'}
            </Button>
          )}
        </div>
      </div>

      {/* Section 3: Language & Interface Preferences */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-teal-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isFr ? 'Langue de l’application' : 'Interface Language'}
              </h2>
              <p className="text-xs text-slate-500">
                {isFr
                  ? 'Choisissez la langue d’affichage du système.'
                  : 'Select your preferred display language.'}
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setLanguage('fr')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                language === 'fr'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Français (FR)
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                language === 'en'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English (EN)
            </button>
          </div>
        </div>
      </div>

      {/* Section 4: Personal Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-4 h-4 text-teal-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isFr ? 'Mon profil utilisateur' : 'My User Profile'}
              </h2>
              <p className="text-xs text-slate-500">
                {isFr
                  ? 'Informations utilisées dans le journal d’audit des mouvements.'
                  : 'Identity recorded in the immutable audit trail.'}
              </p>
            </div>
          </div>
          <Badge variant="teal">{formatRoleLabel(profile.role, language)}</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Nom complet' : 'Full Name'}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Adresse email' : 'Email Address'}
            </label>
            <input
              type="email"
              disabled
              value={profile.email}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-slate-400" />
              <span>{isFr ? 'Mot de passe' : 'Password'}</span>
            </label>
            <input
              type="text"
              disabled
              value={isFr ? 'Géré par Firebase Authentication' : 'Managed by Firebase Authentication'}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Dernière connexion' : 'Last Login'}
            </label>
            <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-600 font-mono">
              {formatTimestamp(profile.lastLogin)}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            icon={<Save className="w-4 h-4" />}
            disabled={saving}
          >
            {saving
              ? isFr
                ? 'Enregistrement...'
                : 'Saving...'
              : isFr
              ? 'Enregistrer les modifications'
              : 'Save changes'}
          </Button>
        </div>
      </form>

      {/* Section 5: Documentation & Offline PDF Manual */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {isFr ? 'Manuel d’utilisation PDF' : 'PDF User Guide'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isFr
              ? 'Téléchargez le guide complet des procédures et emplacements du laboratoire LCSCO.'
              : 'Download the complete laboratory workflow and physical location guide as a PDF.'}
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<FileDown className="w-4 h-4" />}
          onClick={() => downloadApplicationGuidePdf('ALL')}
        >
          {isFr ? 'Télécharger le guide PDF' : 'Download PDF Guide'}
        </Button>
      </div>

      {/* Modal: Add / Edit Physical Location */}
      <Modal
        open={Boolean(editingLoc)}
        onClose={() => setEditingLoc(null)}
        title={
          isFr
            ? 'Configurer un emplacement physique (Salle → Armoire → Côtés → Étagères)'
            : 'Configure Physical Location (Room → Cabinet → Sides → Shelves)'
        }
        subtitle={
          isFr
            ? 'Chaque armoire inclut automatiquement un Côté Gauche (Left) et un Côté Droit (Right) séparés.'
            : 'Each cabinet includes separate Left and Right physical compartments.'
        }
      >
        <form onSubmit={handleSaveLocation} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Salle (Room) *' : 'Room *'}
              </label>
              <input
                type="text"
                required
                value={locRoom}
                onChange={(e) => setLocRoom(e.target.value)}
                placeholder="204"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Code Armoire (Cabinet) *' : 'Cabinet Code *'}
              </label>
              <input
                type="text"
                required
                value={locCabinet}
                onChange={(e) => setLocCabinet(e.target.value.toUpperCase())}
                placeholder="FLAM-01"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Nom descriptif de l’armoire *' : 'Cabinet Descriptive Name *'}
            </label>
            <input
              type="text"
              required
              value={locLabel}
              onChange={(e) => setLocLabel(e.target.value)}
              placeholder="Flammable Cabinet"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Classification de stockage' : 'Storage Classification'}
            </label>
            <select
              value={locStorageClass}
              onChange={(e) => setLocStorageClass(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {STORAGE_CLASSIFICATIONS.map((sc) => (
                <option key={sc} value={sc}>
                  {sc}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Étagères (Shelves)' : 'Shelves (comma-separated)'}
              </label>
              <input
                type="text"
                required
                value={locShelves}
                onChange={(e) => setLocShelves(e.target.value)}
                placeholder="1, 2, 3, 4"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Positions' : 'Positions (comma-separated)'}
              </label>
              <input
                type="text"
                required
                value={locPositions}
                onChange={(e) => setLocPositions(e.target.value)}
                placeholder="01, 02, 03, 04, 05, 06"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingLoc &&
            physicalLocations.some((p) => p.id === editingLoc.id) &&
            physicalLocations.length > 1 ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  deletePhysicalLocation(editingLoc.id);
                  setEditingLoc(null);
                }}
              >
                {isFr ? 'Supprimer' : 'Delete'}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingLoc(null)}
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary">
                {isFr ? 'Enregistrer' : 'Save location'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
