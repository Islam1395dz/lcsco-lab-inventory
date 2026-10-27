import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  MapPin,
  PackagePlus,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import {
  createChemicalContainer,
  createProductCatalogItem,
} from '../services/inventoryService';
import {
  buildStorageLocation,
  computeStockStatus,
  formatPhysicalLocationCode,
  sanitizeId,
} from '../services/inventoryDomain';
import { parseDisplayError } from '../firebase';
import {
  CHEMICAL_CLASSIFICATIONS,
  ChemicalClassification,
  ChemicalContainer,
  ChemicalUnit,
  PermissionAction,
  Product,
  STORAGE_CLASSIFICATIONS,
  StorageClassification,
  TransactionType,
} from '../types/inventory';
import { useLanguage } from '../context/LanguageContext';
import { evaluateChemicalPlacementCompatibility } from '../services/chemicalCompatibilityService';
import { Badge, Button, Modal } from './DesignSystem';

interface CatalogAndAdminViewProps {
  open: boolean;
  onClose: () => void;
  onSelectContainer?: (containerId: string) => void;
}

const COMMON_GHS_CLASSES = [
  'GHS02 Flammable',
  'GHS05 Corrosive',
  'GHS06 Acute Toxic',
  'GHS07 Irritant',
  'GHS08 Health Hazard',
  'GHS09 Environmental',
];

export const CatalogAndAdminView: React.FC<CatalogAndAdminViewProps> = ({
  open,
  onClose,
  onSelectContainer,
}) => {
  const {
    products,
    containers,
    transactions,
    profile,
    isPreviewMode,
    updatePreviewState,
    canPerform,
    physicalLocations,
  } = useInventoryContext();
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const canAddChemical = canPerform(PermissionAction.ADD_NEW_CHEMICAL);

  const [mode, setMode] = useState<'container' | 'catalog'>('container');

  // Container Registration Form State
  const [containerId, setContainerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.productId || '');
  const [initialQty, setInitialQty] = useState('1000');
  const [currentQty, setCurrentQty] = useState('1000');
  const [containerUnit, setContainerUnit] = useState<ChemicalUnit>(ChemicalUnit.MILLILITER);

  // Separate Dropdowns/Fields for Physical Location: Cabinet -> Level -> Side -> Position
  const [room, setRoom] = useState('204');
  const [cabinet, setCabinet] = useState(
    physicalLocations[0]?.cabinet || 'CAB 1'
  );
  const [side, setSide] = useState<'Left' | 'Right'>('Right');
  const [shelf, setShelf] = useState('1');
  const [position, setPosition] = useState('01');

  const [storageCondition, setStorageCondition] = useState(
    'CAB 1 — Laboratory Storage'
  );
  const [lotNumber, setLotNumber] = useState('');
  const [supplier, setSupplier] = useState('Sigma-Aldrich');
  const [expiryDate, setExpiryDate] = useState('2028-12-31');

  // Catalog Product Form State
  const [chemName, setChemName] = useState('');
  const [casNumber, setCasNumber] = useState('');
  const [formula, setFormula] = useState('');
  const [molWeight, setMolWeight] = useState('');
  const [chemClassification, setChemClassification] =
    useState<ChemicalClassification>('Solvents');
  const [storageClassification, setStorageClassification] =
    useState<StorageClassification>('Flammable solvent');
  const [selectedHazards, setSelectedHazards] = useState<string[]>(['GHS02 Flammable']);
  const [storageReq, setStorageReq] = useState('Flammable Cabinet (15-25°C)');
  const [defaultUnit, setDefaultUnit] = useState<ChemicalUnit>(ChemicalUnit.MILLILITER);
  const [minStock, setMinStock] = useState('500');
  const [reorderLevel, setReorderLevel] = useState('1500');
  const [sdsUrl, setSdsUrl] = useState('https://pubchem.ncbi.nlm.nih.gov');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const availableRooms = useMemo(() => {
    const rooms = Array.from(new Set(physicalLocations.map((p) => p.room)));
    return rooms.length > 0 ? rooms : ['204', '308', '101'];
  }, [physicalLocations]);

  const cabinetsForRoom = useMemo(() => {
    const list = physicalLocations.filter((p) => p.room === room);
    return list.length > 0 ? list : physicalLocations;
  }, [physicalLocations, room]);

  const activeCabinetConfig = useMemo(() => {
    return (
      physicalLocations.find((p) => p.room === room && p.cabinet === cabinet) ||
      physicalLocations.find((p) => p.cabinet === cabinet) ||
      physicalLocations[0]
    );
  }, [physicalLocations, room, cabinet]);

  const selectedProductObj = useMemo(
    () => products.find((p) => p.productId === selectedProductId) || products[0] || null,
    [products, selectedProductId]
  );

  const generatedLocationCode = useMemo(
    () =>
      formatPhysicalLocationCode({
        room,
        unit: cabinet,
        side,
        shelf,
        position,
      }),
    [room, cabinet, side, shelf, position]
  );

  const placementReport = useMemo(() => {
    if (!selectedProductObj || !cabinet.trim()) return null;
    return evaluateChemicalPlacementCompatibility({
      candidateProduct: selectedProductObj,
      candidateStorageCondition: storageCondition,
      targetUnitCode: cabinet.trim(),
      targetShelfCode: shelf.trim(),
      allContainers: containers,
      allProducts: products,
    });
  }, [selectedProductObj, storageCondition, cabinet, shelf, containers, products]);

  const toggleHazard = (hazard: string) => {
    setSelectedHazards((prev) =>
      prev.includes(hazard) ? prev.filter((h) => h !== hazard) : [...prev, hazard]
    );
  };

  const handleRegisterContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canAddChemical) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const targetProdId = selectedProductId || products[0]?.productId;
      if (!targetProdId) {
        throw new Error('Please select or create a chemical product first.');
      }

      const cleanId = sanitizeId(containerId.toUpperCase());
      const initQ = parseFloat(initialQty);
      const currQ = parseFloat(currentQty);
      const loc = buildStorageLocation({
        building: 'LCSCO',
        room,
        unit: cabinet,
        cabinetLabel: activeCabinetConfig?.cabinetLabel || 'Storage Cabinet',
        side,
        shelf,
        position,
      });

      if (isPreviewMode) {
        if (containers.some((c) => c.containerId === cleanId)) {
          throw new Error(`A container with ID "${cleanId}" already exists.`);
        }
        const status = computeStockStatus(currQ, initQ);
        const newContainer: ChemicalContainer = {
          containerId: cleanId,
          productId: targetProdId,
          laboratoryId: 'LCSCO',
          initialQuantity: initQ,
          currentQuantity: currQ,
          unit: containerUnit,
          location: loc,
          storageCondition: storageCondition.trim(),
          status,
          lotNumber: lotNumber.trim() || 'LOT-2026',
          supplier: supplier.trim() || 'Sigma-Aldrich',
          expiryDate: expiryDate.trim(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: profile.uid,
          chemicalClassification: selectedProductObj?.chemicalClassification || 'Solvents',
          storageClassification:
            activeCabinetConfig?.storageClassification || 'Flammable solvent',
        };
        const txId = `REG-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: [...containers, newContainer],
          transactions: [
            {
              transactionId: txId,
              type: TransactionType.ADDITION,
              timestamp: new Date().toISOString(),
              userId: profile.uid,
              userName: profile.fullName,
              userRole: profile.role,
              laboratoryId: 'LCSCO',
              containerId: cleanId,
              productId: targetProdId,
              quantityChange: currQ,
              quantityBefore: 0,
              quantityAfter: currQ,
              unit: containerUnit,
              oldLocation: loc.code,
              newLocation: loc.code,
              oldStatus: status,
              newStatus: status,
              reason: `Initial registration at Room ${loc.room} → ${loc.unit} → ${loc.side} → Shelf ${loc.shelf} → Pos ${loc.position} (Lot: ${lotNumber.trim()})`,
            },
            ...transactions,
          ],
        });
      } else {
        await createChemicalContainer({
          containerId: cleanId,
          productId: targetProdId,
          laboratoryId: 'LCSCO',
          initialQuantity: initQ,
          currentQuantity: currQ,
          unit: containerUnit,
          location: {
            building: 'LCSCO',
            room,
            unit: cabinet,
            side,
            shelf,
            position,
          },
          storageCondition,
          lotNumber,
          supplier,
          expiryDate,
          actor: { uid: profile.uid, fullName: profile.fullName, role: profile.role },
        });
      }

      setContainerId('');
      setLotNumber('');
      onClose();
      if (onSelectContainer) {
        onSelectContainer(cleanId);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddChemical) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      if (isPreviewMode) {
        const prodId = `PROD-${Date.now().toString(36).toUpperCase()}`;
        const newProd: Product = {
          productId: prodId,
          chemicalName: chemName.trim(),
          casNumber: casNumber.trim(),
          formula: formula.trim(),
          molecularWeight: parseFloat(molWeight) || 0,
          hazardClass: selectedHazards,
          storageRequirements: storageReq.trim(),
          defaultUnit,
          minimumStock: parseFloat(minStock) || 0,
          reorderLevel: parseFloat(reorderLevel) || 0,
          sdsUrl: sdsUrl.trim() || 'https://pubchem.ncbi.nlm.nih.gov',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          chemicalClassification: chemClassification,
          storageClassification,
        };
        updatePreviewState({
          products: [...products, newProd],
        });
        setSelectedProductId(prodId);
      } else {
        const id = await createProductCatalogItem({
          chemicalName: chemName,
          casNumber,
          formula,
          molecularWeight: parseFloat(molWeight) || 0,
          hazardClass: selectedHazards,
          storageRequirements: storageReq,
          defaultUnit,
          minimumStock: parseFloat(minStock) || 0,
          reorderLevel: parseFloat(reorderLevel) || 0,
          sdsUrl,
        });
        setSelectedProductId(id);
      }

      setFeedback({
        type: 'success',
        message: isFr
          ? `Produit "${chemName}" ajouté au catalogue. Vous pouvez maintenant enregistrer son flacon et son emplacement physique.`
          : `Product "${chemName}" added to catalog. You can now register its container and physical location.`,
      });
      setChemName('');
      setCasNumber('');
      setFormula('');
      setMolWeight('');
      setMode('container');
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isFr ? 'Ajouter un réactif à l’inventaire' : 'Add Reagent to Inventory'}
      subtitle={
        isFr
          ? 'Sélectionnez l’emplacement physique (Salle → Armoire → Côté → Étagère → Position).'
          : 'Select physical location using separate dropdowns (Room → Cabinet → Side → Shelf → Position).'
      }
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {isFr ? 'Annuler' : 'Cancel'}
          </Button>
          <Button
            type="submit"
            form={mode === 'container' ? 'register-container-form' : 'create-product-form'}
            variant="primary"
            disabled={submitting}
          >
            {mode === 'container'
              ? isFr
                ? 'Enregistrer le flacon'
                : 'Register container'
              : isFr
              ? 'Créer la référence'
              : 'Save chemical reference'}
          </Button>
        </div>
      }
    >
      {/* Mode Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
        <button
          type="button"
          onClick={() => setMode('container')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
            mode === 'container'
              ? 'bg-teal-50 text-teal-800 border border-teal-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <PackagePlus className="w-4 h-4" />
          <span>{isFr ? '1. Enregistrer un flacon' : '1. Register Container'}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('catalog')}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
            mode === 'catalog'
              ? 'bg-teal-50 text-teal-800 border border-teal-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          <span>
            {isFr ? '2. Nouvelle référence chimique' : '2. New Chemical Reference'}
          </span>
        </button>
      </div>

      {feedback && (
        <div
          className={`mb-4 px-3.5 py-2.5 rounded-lg border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {mode === 'container' ? (
        <form id="register-container-form" onSubmit={handleRegisterContainer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'ID du flacon (Code-barres / QR) *' : 'Container ID (Barcode / QR) *'}
              </label>
              <input
                type="text"
                required
                value={containerId}
                onChange={(e) => setContainerId(e.target.value)}
                placeholder="e.g. SOL-025"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Réactif du catalogue *' : 'Catalog Reagent *'}
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedProductId(id);
                  const found = products.find((p) => p.productId === id);
                  if (found) {
                    setContainerUnit(found.defaultUnit);
                    const matchedLoc = physicalLocations.find(
                      (loc) =>
                        loc.storageClassification.toLowerCase() ===
                        (found.storageClassification || '').toLowerCase()
                    );
                    if (matchedLoc) {
                      setCabinet(matchedLoc.cabinet);
                      setStorageCondition(
                        `${matchedLoc.cabinetLabel} — ${matchedLoc.storageClassification}`
                      );
                    }
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.chemicalName} ({p.formula})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Quantité initiale *' : 'Initial Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={initialQty}
                onChange={(e) => {
                  setInitialQty(e.target.value);
                  setCurrentQty(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Quantité actuelle *' : 'Current Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={currentQty}
                onChange={(e) => setCurrentQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Unité' : 'Unit'}
              </label>
              <select
                value={containerUnit}
                onChange={(e) => setContainerUnit(e.target.value as ChemicalUnit)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {Object.values(ChemicalUnit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Separate Dropdowns for Physical Location: Cabinet -> Level -> Side -> Position */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <MapPin className="w-4 h-4 text-teal-700" />
                <span>
                  {isFr
                    ? 'Emplacement Physique (Armoire → Niveau → Côté)'
                    : 'Physical Location (Cabinet → Level → Side)'}
                </span>
              </div>
              <Badge variant="teal">{generatedLocationCode}</Badge>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? '1. Armoire (ex: CAB 1)' : '1. Cabinet (e.g. CAB 1)'}
              </label>
              {physicalLocations.length > 0 ? (
                <select
                  value={cabinet}
                  onChange={(e) => {
                    const nextCab = e.target.value;
                    setCabinet(nextCab);
                    const found = physicalLocations.find((p) => p.cabinet === nextCab);
                    if (found) {
                      setRoom(found.room);
                      setStorageCondition(
                        `${found.cabinetLabel} — ${found.storageClassification}`
                      );
                    }
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {physicalLocations.map((c) => (
                    <option key={c.id} value={c.cabinet}>
                      {c.cabinet} — {c.cabinetLabel}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={cabinet}
                  onChange={(e) => setCabinet(e.target.value.toUpperCase())}
                  placeholder="CAB 1"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                />
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isFr ? '2. Niveau (Level)' : '2. Level'}
                </label>
                <select
                  value={shelf}
                  onChange={(e) => setShelf(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {(activeCabinetConfig?.shelves || ['1', '2', '3', '4', '5']).map((sh) => (
                    <option key={sh} value={sh}>
                      Level {sh}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isFr ? '3. Côté (Side)' : '3. Side'}
                </label>
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value as 'Left' | 'Right')}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="Right">{isFr ? 'Côté droit (Right side)' : 'Right side'}</option>
                  <option value="Left">{isFr ? 'Côté gauche (Left side)' : 'Left side'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isFr ? '4. Position' : '4. Position'}
                </label>
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {(
                    activeCabinetConfig?.positions || ['01', '02', '03', '04', '05', '06']
                  ).map((pos) => (
                    <option key={pos} value={pos}>
                      Position {pos}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
              <span>
                <strong>{cabinet}</strong> → <strong>Level {shelf}</strong> →{' '}
                <strong>{side} side</strong>
              </span>
              <span className="font-mono font-bold text-teal-800">
                {generatedLocationCode}
              </span>
            </div>
          </div>

          {placementReport && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                placementReport.overallSeverity === 'DANGER'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : placementReport.overallSeverity === 'WARNING'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="font-semibold">{placementReport.boxFitMessage}</div>
              {placementReport.alerts.map((a) => (
                <div key={a.id} className="mt-1">
                  • {a.title}: {a.message}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Numéro de lot *' : 'Lot Number *'}
              </label>
              <input
                type="text"
                required
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="SHBP4821V"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Fournisseur' : 'Supplier'}
              </label>
              <input
                type="text"
                required
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Date d’expiration' : 'Expiry Date'}
              </label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

        </form>
      ) : (
        <form id="create-product-form" onSubmit={handleCreateProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Nom chimique *' : 'Chemical Name *'}
              </label>
              <input
                type="text"
                required
                value={chemName}
                onChange={(e) => setChemName(e.target.value)}
                placeholder="e.g. Tetrahydrofuran (Anhydrous)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Numéro CAS *' : 'CAS Number *'}
              </label>
              <input
                type="text"
                required
                value={casNumber}
                onChange={(e) => setCasNumber(e.target.value)}
                placeholder="109-99-9"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Classification chimique' : 'Chemical Classification'}
              </label>
              <select
                value={chemClassification}
                onChange={(e) =>
                  setChemClassification(e.target.value as ChemicalClassification)
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {CHEMICAL_CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Classification de stockage' : 'Storage Classification'}
              </label>
              <select
                value={storageClassification}
                onChange={(e) =>
                  setStorageClassification(e.target.value as StorageClassification)
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {STORAGE_CLASSIFICATIONS.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Formule brute *' : 'Formula *'}
              </label>
              <input
                type="text"
                required
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="C4H8O"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Masse molaire (g/mol)' : 'Molecular Weight'}
              </label>
              <input
                type="number"
                step="any"
                value={molWeight}
                onChange={(e) => setMolWeight(e.target.value)}
                placeholder="72.11"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Unité par défaut' : 'Default Unit'}
              </label>
              <select
                value={defaultUnit}
                onChange={(e) => setDefaultUnit(e.target.value as ChemicalUnit)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {Object.values(ChemicalUnit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {isFr ? 'Dangers SGH' : 'GHS Hazards'}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_GHS_CLASSES.map((h) => {
                const active = selectedHazards.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHazard(h)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Stock minimum' : 'Minimum Stock'}
              </label>
              <input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Lien FDS (PubChem)' : 'SDS URL'}
              </label>
              <input
                type="url"
                value={sdsUrl}
                onChange={(e) => setSdsUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

        </form>
      )}
    </Modal>
  );
};
