import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileUp,
  Filter,
  FlaskConical,
  Layers,
  MapPin,
  Minus,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sliders,
  Trash2,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import {
  CHEMICAL_CLASSIFICATIONS,
  ChemicalContainer,
  ChemicalUnit,
  ContainerStatus,
  NotificationPriority,
  PermissionAction,
  PhysicalLocationConfig,
  Product,
  STOCK_ADJUSTMENT_REASONS,
  StockAdjustmentReasonType,
  STORAGE_CLASSIFICATIONS,
  TransactionType,
} from '../types/inventory';
import { useLanguage } from '../context/LanguageContext';
import { extractPhysicalLocationFields } from '../utils/formatters';
import { calculateWithdrawalMutation } from '../services/inventoryDomain';
import { withdrawChemicalStock } from '../services/inventoryService';
import { getApiAuthToken, parseDisplayError } from '../firebase';
import {
  Badge,
  Button,
  ContainerStatusBadge,
  EmptyState,
  Modal,
  PageHeader,
} from './DesignSystem';

interface InventoryTableViewProps {
  onSelectContainer: (containerId: string) => void;
  onOpenAddModal?: () => void;
}

export const InventoryTableView: React.FC<InventoryTableViewProps> = ({
  onSelectContainer,
  onOpenAddModal,
}) => {
  const {
    containers,
    products,
    transactions,
    profile,
    isAdmin,
    isTechnician,
    isPreviewMode,
    updatePreviewState,
    canPerform,
    reportStockRupture,
    createPurchaseRequest,
    createDisposalRequest,
    adjustContainerQuantityDirectly,
    physicalLocations,
    savePhysicalLocation,
    deletePhysicalLocation,
    renameShelfInCabinet,
    deleteShelfFromCabinet,
    updateContainerAndProduct,
    deleteContainerById,
    clearAllInventoryAndCabinets,
    importRealInventoryBatch,
  } = useInventoryContext();
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const canDirectlyAdjustQuantity = isAdmin || isTechnician;
  const canManageLocations = canPerform(PermissionAction.MANAGE_STORAGE_LOCATIONS);
  const canEditEverything = isAdmin || isTechnician || canPerform(PermissionAction.EDIT_CHEMICAL_INFO);
  const canDeleteItems = isAdmin || isTechnician || canPerform(PermissionAction.ARCHIVE_REMOVE_CHEMICAL);

  const [viewMode, setViewMode] = useState<'list' | 'cabinets'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [cabinetFilter, setCabinetFilter] = useState<string>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'Left' | 'Right'>('ALL');
  const [classificationFilter, setClassificationFilter] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // Selected Cabinet in Cabinet View
  const [selectedCabinetCode, setSelectedCabinetCode] = useState<string>('CAB 1');

  // Real Inventory Importer Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileBase64, setImportFileBase64] = useState<string | null>(null);
  const [importFileMimeType, setImportFileMimeType] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [importRawText, setImportRawText] = useState<string>('');
  const [importingInventory, setImportingInventory] = useState(false);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  // Row dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Quick Consumption Modal
  const [consumeTarget, setConsumeTarget] = useState<ChemicalContainer | null>(null);
  const [consumeAmount, setConsumeAmount] = useState('');
  const [consumeReason, setConsumeReason] = useState('');

  // Controlled Quantity Adjustment Modal (Director & Lab Engineer) with 2-Step Confirmation
  const [adjustTarget, setAdjustTarget] = useState<ChemicalContainer | null>(null);
  const [adjNewQuantity, setAdjNewQuantity] = useState('');
  const [adjReasonType, setAdjReasonType] = useState<StockAdjustmentReasonType>(
    'Physical inventory count'
  );
  const [adjComment, setAdjComment] = useState('');
  const [adjConfirmStep, setAdjConfirmStep] = useState(false);

  // Quick Rupture Report Modal
  const [ruptureTarget, setRuptureTarget] = useState<ChemicalContainer | null>(null);
  const [rupturePriority, setRupturePriority] = useState<NotificationPriority>(
    NotificationPriority.CRITICAL
  );
  const [ruptureComment, setRuptureComment] = useState('');

  // Quick Purchase Request Modal
  const [purchaseTarget, setPurchaseTarget] = useState<ChemicalContainer | null>(null);
  const [purchaseQty, setPurchaseQty] = useState('1000');
  const [purchaseReason, setPurchaseReason] = useState('');

  // Quick Disposal Request Modal
  const [disposalTarget, setDisposalTarget] = useState<ChemicalContainer | null>(null);
  const [disposalReason, setDisposalReason] = useState('');

  // Physical Location Editor Modal (Add / Edit Cabinet & Shelves)
  const [editingLocationConfig, setEditingLocationConfig] =
    useState<PhysicalLocationConfig | null>(null);
  const [locFormRoom, setLocFormRoom] = useState('Hallway');
  const [locFormCabinet, setLocFormCabinet] = useState('');
  const [locFormLabel, setLocFormLabel] = useState('');
  const [locFormStorageClass, setLocFormStorageClass] = useState<string>('General storage');
  const [locFormShelves, setLocFormShelves] = useState('1, 2, 3, 4, 5');
  const [locFormPositions, setLocFormPositions] = useState('01, 02, 03, 04, 05, 06, 07, 08, 09, 10');

  // Inline Shelf Rename Modal
  const [shelfEditTarget, setShelfEditTarget] = useState<{
    cabinetId: string;
    cabinetCode: string;
    oldShelf: string;
  } | null>(null);
  const [newShelfName, setNewShelfName] = useState('');

  // Quick Add Shelf to Active Cabinet Modal
  const [addingShelfToCab, setAddingShelfToCab] = useState<PhysicalLocationConfig | null>(null);
  const [newAddedShelfName, setNewAddedShelfName] = useState('');

  // Full Reagent / Solvent / Salt Edit Modal (Director & Lab Engineer)
  const [editItemTarget, setEditItemTarget] = useState<ChemicalContainer | null>(null);
  const [editContainerIdVal, setEditContainerIdVal] = useState('');
  const [editChemName, setEditChemName] = useState('');
  const [editCasNumber, setEditCasNumber] = useState('');
  const [editFormula, setEditFormula] = useState('');
  const [editMolWeight, setEditMolWeight] = useState('');
  const [editChemClass, setEditChemClass] = useState('Salts');
  const [editStorageClass, setEditStorageClass] = useState('General storage');
  const [editInitialQty, setEditInitialQty] = useState('');
  const [editCurrentQty, setEditCurrentQty] = useState('');
  const [editUnit, setEditUnit] = useState<ChemicalUnit>(ChemicalUnit.GRAM);
  const [editMinStock, setEditMinStock] = useState('');
  const [editReorderLevel, setEditReorderLevel] = useState('');
  const [editLotNumber, setEditLotNumber] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editRoom, setEditRoom] = useState('Hallway');
  const [editCabinet, setEditCabinet] = useState('CAB 1');
  const [editSide, setEditSide] = useState<'Left' | 'Right'>('Left');
  const [editShelf, setEditShelf] = useState('1');
  const [editPosition, setEditPosition] = useState('01');
  const [editStatus, setEditStatus] = useState<ContainerStatus>(ContainerStatus.NORMAL);
  const [editSdsUrl, setEditSdsUrl] = useState('');

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<ChemicalContainer | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const cabinets = useMemo(() => {
    const set = new Set<string>();
    physicalLocations.forEach((p) => set.add(p.cabinet));
    containers.forEach((c) => {
      if (c.location?.unit) set.add(c.location.unit);
    });
    return Array.from(set).sort();
  }, [containers, physicalLocations]);

  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      const prod = productMap.get(c.productId);
      const loc = extractPhysicalLocationFields(c.location);

      if (statusFilter !== 'ALL' && c.status !== statusFilter) {
        return false;
      }

      if (cabinetFilter !== 'ALL' && loc.cabinet !== cabinetFilter) {
        return false;
      }

      if (sideFilter !== 'ALL' && loc.side !== sideFilter) {
        return false;
      }

      const itemClass =
        c.chemicalClassification || prod?.chemicalClassification || 'Other';
      if (classificationFilter !== 'ALL' && itemClass !== classificationFilter) {
        return false;
      }

      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = c.containerId.toLowerCase().includes(q);
        const matchesName = prod?.chemicalName.toLowerCase().includes(q) || false;
        const matchesCas = prod?.casNumber.toLowerCase().includes(q) || false;
        const matchesFormula = prod?.formula.toLowerCase().includes(q) || false;
        const matchesLocation =
          loc.code.toLowerCase().includes(q) ||
          loc.cabinet.toLowerCase().includes(q) ||
          loc.room.toLowerCase().includes(q) ||
          loc.side.toLowerCase().includes(q);
        const matchesClass = itemClass.toLowerCase().includes(q);
        return (
          matchesId ||
          matchesName ||
          matchesCas ||
          matchesFormula ||
          matchesLocation ||
          matchesClass
        );
      }

      return true;
    });
  }, [
    containers,
    productMap,
    statusFilter,
    cabinetFilter,
    sideFilter,
    classificationFilter,
    searchQuery,
  ]);

  const handleQuickConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumeTarget || !profile) return;
    setSubmitting(true);
    try {
      const amount = parseFloat(consumeAmount);
      if (isPreviewMode) {
        const calc = calculateWithdrawalMutation(
          consumeTarget,
          amount,
          consumeTarget.unit,
          consumeReason
        );
        const txId = `WD-${Date.now().toString(36).toUpperCase()}`;
        updatePreviewState({
          containers: containers.map((c) =>
            c.containerId === consumeTarget.containerId
              ? {
                  ...c,
                  currentQuantity: calc.quantityAfter,
                  status: calc.newStatus,
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
          transactions: [
            {
              transactionId: txId,
              type: TransactionType.WITHDRAWAL,
              timestamp: new Date().toISOString(),
              userId: profile.uid,
              userName: profile.fullName,
              userRole: profile.role,
              laboratoryId: consumeTarget.laboratoryId,
              containerId: consumeTarget.containerId,
              productId: consumeTarget.productId,
              quantityChange: calc.quantityChange,
              quantityBefore: calc.quantityBefore,
              quantityAfter: calc.quantityAfter,
              unit: consumeTarget.unit,
              oldLocation: consumeTarget.location.code,
              newLocation: consumeTarget.location.code,
              oldStatus: calc.oldStatus,
              newStatus: calc.newStatus,
              reason: consumeReason.trim(),
            },
            ...transactions,
          ],
        });
      } else {
        await withdrawChemicalStock({
          containerId: consumeTarget.containerId,
          amount,
          unit: consumeTarget.unit,
          reason: consumeReason,
          actor: { uid: profile.uid, fullName: profile.fullName, role: profile.role },
        });
      }
      setToast({
        type: 'success',
        text: isFr
          ? `Consommation enregistrée (-${amount} ${consumeTarget.unit} sur ${consumeTarget.containerId}).`
          : `Consumption recorded (-${amount} ${consumeTarget.unit} from ${consumeTarget.containerId}).`,
      });
      setConsumeTarget(null);
      setConsumeAmount('');
      setConsumeReason('');
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmQuickAdjust = () => {
    if (!adjustTarget || !canDirectlyAdjustQuantity) return;
    setSubmitting(true);
    try {
      const newQty = parseFloat(adjNewQuantity);
      const prevQty = adjustTarget.currentQuantity;
      const diff = Math.round((newQty - prevQty) * 10000) / 10000;
      adjustContainerQuantityDirectly({
        containerId: adjustTarget.containerId,
        newQuantity: newQty,
        adjustmentType: adjReasonType,
        comment: adjComment,
      });
      setToast({
        type: 'success',
        text: isFr
          ? `Quantité ajustée (${adjustTarget.containerId}) : ${prevQty} → ${newQty} ${adjustTarget.unit} (${diff >= 0 ? '+' : ''}${diff} ${adjustTarget.unit}).`
          : `Quantity adjusted (${adjustTarget.containerId}): ${prevQty} → ${newQty} ${adjustTarget.unit} (${diff >= 0 ? '+' : ''}${diff} ${adjustTarget.unit}).`,
      });
      setAdjustTarget(null);
      setAdjConfirmStep(false);
      setAdjComment('');
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickRupture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruptureTarget) return;
    setSubmitting(true);
    try {
      const res = reportStockRupture({
        containerId: ruptureTarget.containerId,
        priority: rupturePriority,
        comment: ruptureComment,
      });
      setToast({
        type: 'success',
        text: res.wasMergedDuplicate
          ? isFr
            ? `Signalement fusionné avec l'alerte active (${res.ruptureRequest.ruptureId}).`
            : `Merged with active rupture alert (${res.ruptureRequest.ruptureId}).`
          : isFr
          ? `Rupture signalée (${res.ruptureRequest.ruptureId}). Directeur et Ingénieur de Laboratoire notifiés.`
          : `Stock rupture reported (${res.ruptureRequest.ruptureId}). Director and Lab Engineer notified.`,
      });
      setRuptureTarget(null);
      setRuptureComment('');
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseTarget) return;
    setSubmitting(true);
    try {
      const prod = productMap.get(purchaseTarget.productId);
      createPurchaseRequest({
        chemicalName: prod?.chemicalName || purchaseTarget.productId,
        casNumber: prod?.casNumber || 'N/A',
        formula: prod?.formula || 'N/A',
        requestedQuantity: parseFloat(purchaseQty) || 1000,
        unit: purchaseTarget.unit,
        supplier: purchaseTarget.supplier || 'Sigma-Aldrich',
        reason: purchaseReason,
        targetPlacementBox: purchaseTarget.location.unit,
      });
      setToast({
        type: 'success',
        text: isFr ? 'Demande d’achat soumise.' : 'Purchase request submitted.',
      });
      setPurchaseTarget(null);
      setPurchaseReason('');
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDisposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposalTarget) return;
    setSubmitting(true);
    try {
      createDisposalRequest({
        containerId: disposalTarget.containerId,
        reason: disposalReason,
      });
      setToast({
        type: 'success',
        text: isFr ? 'Demande d’élimination soumise.' : 'Disposal request submitted.',
      });
      setDisposalTarget(null);
      setDisposalReason('');
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const openLocationEditor = (existing?: PhysicalLocationConfig) => {
    if (existing) {
      setEditingLocationConfig(existing);
      setLocFormRoom(existing.room);
      setLocFormCabinet(existing.cabinet);
      setLocFormLabel(existing.cabinetLabel);
      setLocFormStorageClass(existing.storageClassification);
      setLocFormShelves(existing.shelves.join(', '));
      setLocFormPositions(existing.positions.join(', '));
    } else {
      const nextNum = physicalLocations.length + 1;
      const defaultCabCode = `CAB ${nextNum}`;
      setEditingLocationConfig({
        id: `CAB-${Date.now().toString(36).toUpperCase()}`,
        room: '204',
        cabinet: defaultCabCode,
        cabinetLabel: `Cabinet ${nextNum}`,
        storageClassification: 'General storage',
        sides: ['Left', 'Right'],
        shelves: ['1', '2', '3', '4'],
        positions: ['01', '02', '03', '04', '05', '06'],
      });
      setLocFormRoom('204');
      setLocFormCabinet(defaultCabCode);
      setLocFormLabel(`Cabinet ${nextNum}`);
      setLocFormStorageClass('General storage');
      setLocFormShelves('1, 2, 3, 4');
      setLocFormPositions('01, 02, 03, 04, 05, 06');
    }
  };

  const handleFileChangeForImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportFileMimeType(file.type || 'application/pdf');
    const reader = new FileReader();
    reader.onload = () => {
      const resStr = String(reader.result || '');
      const base64Part = resStr.includes(',') ? resStr.split(',')[1] : resStr;
      setImportFileBase64(base64Part);
    };
    reader.readAsDataURL(file);
  };

  const handleImportRealInventorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFileBase64 && !importRawText.trim()) {
      setToast({
        type: 'error',
        text: isFr
          ? 'Veuillez joindre un fichier (PDF/Image/CSV) ou coller la liste d’inventaire.'
          : 'Please attach an inventory file (PDF/Image/CSV) or paste the inventory list.',
      });
      return;
    }

    setImportingInventory(true);
    try {
      const authToken = await getApiAuthToken();
      const res = await fetch('/api/inventory/import-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          fileBase64: importFileBase64,
          mimeType: importFileMimeType || 'application/pdf',
          rawText: importRawText,
          replaceExisting: false,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to parse inventory document.');
      }

      const result = await importRealInventoryBatch({
        cabinets: data.cabinets || [],
        reagents: data.reagents || [],
        replaceExisting: false,
      });

      setImportModalOpen(false);
      setImportFileBase64(null);
      setImportFileName('');
      setImportRawText('');
      setToast({
        type: 'success',
        text: isFr
          ? `Inventaire réel importé : ${result.cabinetsCount} armoire(s) et ${result.reagentsCount} réactif(s) créés au format "CAB 1- Level 1- Right side".`
          : `Real inventory imported: ${result.cabinetsCount} cabinet(s) and ${result.reagentsCount} reagent(s) created with format "CAB 1- Level 1- Right side".`,
      });
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setImportingInventory(false);
    }
  };

  const handleConfirmClearAllInventory = async () => {
    setSubmitting(true);
    try {
      await clearAllInventoryAndCabinets();
      setConfirmClearAllOpen(false);
      setToast({
        type: 'success',
        text: isFr
          ? 'Tous les réactifs et toutes les armoires ont été supprimés.'
          : 'All reagents and cabinets have been deleted.',
      });
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveLocationConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocationConfig) return;
    const shelves = locFormShelves
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const positions = locFormPositions
      .split(',')
      .map((p) => p.trim().padStart(2, '0'))
      .filter(Boolean);

    const updated: PhysicalLocationConfig = {
      id: editingLocationConfig.id,
      room: locFormRoom.trim() || '204',
      cabinet: locFormCabinet.trim().toUpperCase() || 'CAB-01',
      cabinetLabel: locFormLabel.trim() || 'Storage Cabinet',
      storageClassification: locFormStorageClass,
      sides: ['Left', 'Right'],
      shelves: shelves.length > 0 ? shelves : ['1', '2', '3'],
      positions: positions.length > 0 ? positions : ['01', '02', '03', '04'],
    };

    savePhysicalLocation(
      updated,
      editingLocationConfig.cabinet,
      editingLocationConfig.room
    );
    setSelectedCabinetCode(updated.cabinet);
    setEditingLocationConfig(null);
    setToast({
      type: 'success',
      text: isFr
        ? `Emplacement physique enregistré : Salle ${updated.room} → Armoire ${updated.cabinet} (${updated.cabinetLabel}).`
        : `Physical location saved: Room ${updated.room} → Cabinet ${updated.cabinet} (${updated.cabinetLabel}).`,
    });
  };

  const openFullEditModal = (c: ChemicalContainer) => {
    const prod = productMap.get(c.productId);
    const loc = extractPhysicalLocationFields(c.location);
    setEditItemTarget(c);
    setEditContainerIdVal(c.containerId);
    setEditChemName(prod?.chemicalName || c.productId);
    setEditCasNumber(prod?.casNumber || '');
    setEditFormula(prod?.formula || '');
    setEditMolWeight(String(prod?.molecularWeight || 0));
    setEditChemClass(
      c.chemicalClassification || prod?.chemicalClassification || 'Solvents'
    );
    setEditStorageClass(
      c.storageClassification || prod?.storageClassification || 'Flammable solvent'
    );
    setEditInitialQty(String(c.initialQuantity));
    setEditCurrentQty(String(c.currentQuantity));
    setEditUnit(c.unit);
    setEditMinStock(String(prod?.minimumStock || 0));
    setEditReorderLevel(String(prod?.reorderLevel || 0));
    setEditLotNumber(c.lotNumber);
    setEditSupplier(c.supplier);
    setEditExpiryDate(c.expiryDate);
    setEditRoom(loc.room);
    setEditCabinet(loc.cabinet);
    setEditSide(loc.side);
    setEditShelf(loc.shelf);
    setEditPosition(loc.position);
    setEditStatus(c.status);
    setEditSdsUrl(prod?.sdsUrl || 'https://pubchem.ncbi.nlm.nih.gov');
  };

  const handleSaveFullEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemTarget || !canEditEverything) return;
    setSubmitting(true);
    try {
      const matchedCab = physicalLocations.find(
        (p) => p.room === editRoom && p.cabinet === editCabinet
      ) || physicalLocations.find((p) => p.cabinet === editCabinet);

      updateContainerAndProduct({
        containerId: editItemTarget.containerId,
        newContainerId: editContainerIdVal.trim().toUpperCase(),
        chemicalName: editChemName,
        casNumber: editCasNumber,
        formula: editFormula,
        molecularWeight: parseFloat(editMolWeight) || 0,
        chemicalClassification: editChemClass,
        storageClassification: editStorageClass,
        hazardClass: productMap.get(editItemTarget.productId)?.hazardClass || ['GHS07 Irritant'],
        minimumStock: parseFloat(editMinStock) || 0,
        reorderLevel: parseFloat(editReorderLevel) || 0,
        sdsUrl: editSdsUrl,
        initialQuantity: parseFloat(editInitialQty) || 0,
        currentQuantity: parseFloat(editCurrentQty) || 0,
        unit: editUnit,
        lotNumber: editLotNumber,
        supplier: editSupplier,
        expiryDate: editExpiryDate,
        room: editRoom,
        cabinet: editCabinet,
        cabinetLabel: matchedCab?.cabinetLabel,
        side: editSide,
        shelf: editShelf,
        position: editPosition,
        status: editStatus,
      });

      setToast({
        type: 'success',
        text: isFr
          ? `Modifications enregistrées pour ${editChemName} (${editContainerIdVal.toUpperCase()}).`
          : `Saved all changes for ${editChemName} (${editContainerIdVal.toUpperCase()}).`,
      });
      setEditItemTarget(null);
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeleteContainer = () => {
    if (!deleteTarget || !canDeleteItems) return;
    try {
      deleteContainerById(deleteTarget.containerId);
      setToast({
        type: 'success',
        text: isFr
          ? `Réactif ${deleteTarget.containerId} supprimé de l’inventaire.`
          : `Reagent ${deleteTarget.containerId} deleted from inventory.`,
      });
      setDeleteTarget(null);
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    }
  };

  const handleRenameShelfSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shelfEditTarget || !newShelfName.trim()) return;
    try {
      renameShelfInCabinet({
        cabinetId: shelfEditTarget.cabinetId,
        oldShelf: shelfEditTarget.oldShelf,
        newShelf: newShelfName.trim(),
      });
      setToast({
        type: 'success',
        text: isFr
          ? `Étagère "${shelfEditTarget.oldShelf}" renommée en "${newShelfName.trim()}" dans ${shelfEditTarget.cabinetCode}.`
          : `Shelf "${shelfEditTarget.oldShelf}" renamed to "${newShelfName.trim()}" in ${shelfEditTarget.cabinetCode}.`,
      });
      setShelfEditTarget(null);
      setNewShelfName('');
    } catch (err) {
      setToast({ type: 'error', text: parseDisplayError(err) });
    }
  };

  const handleAddShelfToCabinetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingShelfToCab || !newAddedShelfName.trim()) return;
    const clean = newAddedShelfName.trim();
    const nextShelves = Array.from(new Set([...addingShelfToCab.shelves, clean]));
    savePhysicalLocation(
      { ...addingShelfToCab, shelves: nextShelves },
      addingShelfToCab.cabinet,
      addingShelfToCab.room
    );
    setToast({
      type: 'success',
      text: isFr
        ? `Étagère "${clean}" ajoutée à l’armoire ${addingShelfToCab.cabinet}.`
        : `Shelf "${clean}" added to cabinet ${addingShelfToCab.cabinet}.`,
    });
    setAddingShelfToCab(null);
    setNewAddedShelfName('');
  };

  const activeCabinetConfig = useMemo(() => {
    return (
      physicalLocations.find((p) => p.cabinet === selectedCabinetCode) ||
      physicalLocations[0] || {
        id: 'CAB-1',
        room: '204',
        cabinet: 'CAB 1',
        cabinetLabel: 'Cabinet 1',
        storageClassification: 'General storage',
        sides: ['Left', 'Right'],
        shelves: ['1', '2', '3', '4'],
        positions: ['01', '02', '03', '04', '05', '06'],
      }
    );
  }, [physicalLocations, selectedCabinetCode]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isFr ? 'Réactifs & Emplacements Physiques' : 'Reagents & Physical Locations'}
        subtitle={
          isFr
            ? `${containers.length} réactif(s) et ${physicalLocations.length} armoire(s) — Format : CAB 1- Level 1- Right side`
            : `${containers.length} reagent(s) and ${physicalLocations.length} cabinet(s) — Format: CAB 1- Level 1- Right side`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isFr ? 'Liste des réactifs' : 'Reagents Table'}
              </button>
              <button
                onClick={() => setViewMode('cabinets')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'cabinets'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isFr ? 'Armoires & Niveaux' : 'Cabinets & Levels'}</span>
              </button>
            </div>

            {canPerform(PermissionAction.ADD_NEW_CHEMICAL) && (
              <Button
                variant="secondary"
                icon={<FileUp className="w-4 h-4 text-teal-700" />}
                onClick={() => setImportModalOpen(true)}
              >
                {isFr ? 'Importer l’inventaire réel (PDF/Liste)' : 'Import Real Inventory (PDF/List)'}
              </Button>
            )}

            {canDeleteItems && (containers.length > 0 || physicalLocations.length > 0) && (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => setConfirmClearAllOpen(true)}
              >
                {isFr ? 'Tout supprimer' : 'Delete All'}
              </Button>
            )}

            {canManageLocations && (
              <Button
                variant="secondary"
                icon={<Settings2 className="w-4 h-4" />}
                onClick={() => openLocationEditor()}
              >
                {isFr ? 'Nouvelle armoire' : 'Add Cabinet'}
              </Button>
            )}

            {canPerform(PermissionAction.ADD_NEW_CHEMICAL) && onOpenAddModal && (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={onOpenAddModal}
              >
                {isFr ? 'Ajouter un réactif' : 'Add Reagent'}
              </Button>
            )}
          </div>
        }
      />

      {/* Toast Feedback */}
      {toast && (
        <div
          className={`px-4 py-3 rounded-lg border flex items-center justify-between text-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-xs font-medium underline ml-4">
            {isFr ? 'Fermer' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isFr
                  ? 'Rechercher par nom, CAS, armoire (CAB 1, CAB 2, CAB 3, CAB 4), ou code (CAB 1- Level 1- Left side)...'
                  : 'Search by chemical name, CAS, cabinet (CAB 1, CAB 2, CAB 3, CAB 4), or code (CAB 1- Level 1- Left side)...'
              }
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50/60 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-600"
            >
              <option value="ALL">
                {isFr ? 'Toutes les familles chimiques (24)' : 'All Chemical Groups (24)'}
              </option>
              {CHEMICAL_CLASSIFICATIONS.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>

            <Button
              variant={
                showFilters ||
                statusFilter !== 'ALL' ||
                cabinetFilter !== 'ALL' ||
                sideFilter !== 'ALL'
                  ? 'secondary'
                  : 'ghost'
              }
              size="md"
              icon={<Filter className="w-4 h-4" />}
              onClick={() => setShowFilters((prev) => !prev)}
            >
              {isFr ? 'Filtres' : 'Filters'}
            </Button>
          </div>
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {isFr ? 'Statut du stock' : 'Stock Status'}
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="ALL">{isFr ? 'Tous les statuts' : 'All statuses'}</option>
                <option value={ContainerStatus.NORMAL}>
                  {isFr ? 'Disponible' : 'Available'}
                </option>
                <option value={ContainerStatus.LOW_STOCK}>
                  {isFr ? 'Stock faible' : 'Low stock'}
                </option>
                <option value={ContainerStatus.NEARLY_EMPTY}>
                  {isFr ? 'Rupture / Critique' : 'Nearly empty'}
                </option>
                <option value={ContainerStatus.NEEDS_IDENTIFICATION}>
                  {isFr ? 'À vérifier' : 'Needs ID'}
                </option>
                <option value={ContainerStatus.QUARANTINED}>
                  {isFr ? 'En quarantaine' : 'Quarantined'}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {isFr ? 'Armoire (Cabinet)' : 'Cabinet'}
              </label>
              <select
                value={cabinetFilter}
                onChange={(e) => setCabinetFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="ALL">{isFr ? 'Toutes les armoires' : 'All cabinets'}</option>
                {cabinets.map((cab) => (
                  <option key={cab} value={cab}>
                    {cab}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {isFr ? 'Côté (Gauche / Droit)' : 'Side (Left / Right)'}
              </label>
              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value as 'ALL' | 'Left' | 'Right')}
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="ALL">{isFr ? 'Gauche & Droit' : 'Left & Right sides'}</option>
                <option value="Left">{isFr ? 'Côté Gauche (Left)' : 'Left side'}</option>
                <option value="Right">{isFr ? 'Côté Droit (Right)' : 'Right side'}</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('ALL');
                  setCabinetFilter('ALL');
                  setSideFilter('ALL');
                  setClassificationFilter('ALL');
                  setSearchQuery('');
                }}
              >
                {isFr ? 'Réinitialiser les filtres' : 'Reset filters'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: Clean Reagents Table */}
      {viewMode === 'list' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredContainers.length === 0 ? (
            <EmptyState
              icon={<FlaskConical className="w-6 h-6" />}
              title={
                containers.length === 0
                  ? isFr
                    ? 'Inventaire vide — Prêt pour l’inventaire réel'
                    : 'Inventory Cleared — Ready for Real Laboratory Inventory'
                  : isFr
                  ? 'Aucun réactif trouvé'
                  : 'No matching reagents found'
              }
              description={
                containers.length === 0
                  ? isFr
                    ? 'Tous les anciens réactifs et armoires ont été supprimés. Importez votre fichier PDF/liste d’inventaire réel ou créez vos armoires au format "CAB 1- Level 1- Right side".'
                    : 'All previous reagents and cabinets have been deleted. Import your real inventory PDF/list or create cabinets and reagents using the format "CAB 1- Level 1- Right side".'
                  : isFr
                  ? 'Modifiez vos critères de recherche ou réinitialisez les filtres.'
                  : 'Try adjusting your search query or clearing active filters.'
              }
              action={
                containers.length === 0 && canPerform(PermissionAction.ADD_NEW_CHEMICAL) ? (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <Button
                      variant="primary"
                      icon={<FileUp className="w-4 h-4" />}
                      onClick={() => setImportModalOpen(true)}
                    >
                      {isFr
                        ? 'Importer l’inventaire réel (PDF / Liste)'
                        : 'Import Real Inventory (PDF / List)'}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Settings2 className="w-4 h-4" />}
                      onClick={() => openLocationEditor()}
                    >
                      {isFr ? 'Créer une armoire (CAB 1)' : 'Create Cabinet (CAB 1)'}
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">{isFr ? 'Nom du réactif' : 'Chemical Name'}</th>
                    <th className="py-3 px-4">{isFr ? 'Famille / CAS' : 'Group / CAS'}</th>
                    <th className="py-3 px-4 text-right">{isFr ? 'Quantité' : 'Quantity'}</th>
                    <th className="py-3 px-4">
                      {isFr
                        ? 'Emplacement Physique (CAB X- Level Y- Side)'
                        : 'Physical Location (CAB X- Level Y- Side)'}
                    </th>
                    <th className="py-3 px-4">{isFr ? 'Statut' : 'Status'}</th>
                    <th className="py-3 px-4 text-right">{isFr ? 'Actions' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredContainers.map((container) => {
                    const prod = productMap.get(container.productId);
                    const loc = extractPhysicalLocationFields(container.location);
                    const isMenuOpen = openMenuId === container.containerId;
                    const chemGroup =
                      container.chemicalClassification ||
                      prod?.chemicalClassification ||
                      'Solvents';

                    return (
                      <tr
                        key={container.containerId}
                        onClick={() => onSelectContainer(container.containerId)}
                        className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900 group-hover:text-teal-700 transition-colors">
                            {prod?.chemicalName || container.productId}
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {container.containerId} · {prod?.formula || '—'} · Exp:{' '}
                            {container.expiryDate}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-xs font-semibold text-slate-800">{chemGroup}</div>
                          <div className="font-mono text-xs text-slate-500 mt-0.5">
                            CAS {prod?.casNumber || '—'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono whitespace-nowrap">
                          <span className="font-semibold text-slate-900">
                            {container.currentQuantity} {container.unit}
                          </span>
                          <div className="text-[11px] text-slate-400">
                            / {container.initialQuantity} {container.unit}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900">
                            <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span>
                              {loc.cabinet}- Level {loc.shelf}-{' '}
                              <span
                                className={
                                  loc.side === 'Left' ? 'text-teal-700' : 'text-indigo-700'
                                }
                              >
                                {loc.side} side
                              </span>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono pl-5 mt-0.5">
                            {loc.cabinetLabel} · Pos {loc.position}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <ContainerStatusBadge status={container.status} isFr={isFr} />
                        </td>

                        <td
                          className="py-3.5 px-4 text-right whitespace-nowrap relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onSelectContainer(container.containerId)}
                            >
                              {isFr ? 'Détails' : 'View'}
                            </Button>

                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId(isMenuOpen ? null : container.containerId)
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              aria-label="More actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>

                          {isMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-20"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-4 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30 text-left text-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onSelectContainer(container.containerId);
                                  }}
                                  className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{isFr ? 'Voir la fiche complète' : 'View details'}</span>
                                </button>

                                {canEditEverything && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      openFullEditModal(container);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-teal-600" />
                                    <span>
                                      {isFr ? 'Modifier tout (Nom, Qté, Lieu...)' : 'Edit reagent / details'}
                                    </span>
                                  </button>
                                )}

                                {canPerform(PermissionAction.RECORD_CONSUMPTION) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConsumeTarget(container);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Minus className="w-3.5 h-3.5 text-teal-600" />
                                    <span>
                                      {isFr ? 'Enregistrer consommation' : 'Record consumption'}
                                    </span>
                                  </button>
                                )}

                                {canDirectlyAdjustQuantity && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setAdjustTarget(container);
                                      setAdjNewQuantity(String(container.currentQuantity));
                                      setAdjReasonType('Physical inventory count');
                                      setAdjComment('');
                                      setAdjConfirmStep(false);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium"
                                  >
                                    <Sliders className="w-3.5 h-3.5 text-teal-600" />
                                    <span>
                                      {isFr ? 'Ajuster la quantité' : 'Adjust quantity'}
                                    </span>
                                  </button>
                                )}

                                {canPerform(PermissionAction.REPORT_STOCK_RUPTURE) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setRuptureTarget(container);
                                    }}
                                    className="w-full px-3.5 py-2 text-rose-700 hover:bg-rose-50 flex items-center gap-2 font-medium"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                    <span>
                                      {isFr ? 'Signaler rupture' : 'Report stock rupture'}
                                    </span>
                                  </button>
                                )}

                                {canPerform(PermissionAction.CREATE_PURCHASE_REQUEST) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setPurchaseTarget(container);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Package className="w-3.5 h-3.5 text-slate-400" />
                                    <span>
                                      {isFr ? 'Demander un achat' : 'Request purchase'}
                                    </span>
                                  </button>
                                )}

                                {canPerform(PermissionAction.CREATE_DISPOSAL_REQUEST) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setDisposalTarget(container);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                                    <span>
                                      {isFr ? 'Demander élimination' : 'Request disposal'}
                                    </span>
                                  </button>
                                )}

                                {canDeleteItems && (
                                  <div className="border-t border-slate-100 mt-1 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setDeleteTarget(container);
                                      }}
                                      className="w-full px-3.5 py-2 text-rose-700 hover:bg-rose-50 flex items-center gap-2 font-medium"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                      <span>
                                        {isFr ? 'Supprimer ce réactif' : 'Delete reagent'}
                                      </span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: Physical Laboratory Layout (Cabinet -> Level -> Left/Right Side -> Positions) */}
      {viewMode === 'cabinets' && (
        <div className="space-y-6">
          {/* Cabinet Selector Pills */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {isFr
                    ? 'Sélectionner une armoire du laboratoire'
                    : 'Select Laboratory Storage Cabinet'}
                </h2>
                <p className="text-xs text-slate-500">
                  {isFr
                    ? 'Format officiel de l’inventaire PDF : CAB X- Level Y- Left/Right side'
                    : 'Official PDF Inventory Format: CAB X- Level Y- Left/Right side'}
                </p>
              </div>
              {canManageLocations && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openLocationEditor(activeCabinetConfig)}
                  >
                    {isFr ? 'Modifier cette armoire' : 'Edit cabinet layout'}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => openLocationEditor()}
                  >
                    {isFr ? 'Créer une armoire' : 'New cabinet'}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {physicalLocations.map((locCfg) => {
                const countInCab = filteredContainers.filter(
                  (c) => extractPhysicalLocationFields(c.location).cabinet === locCfg.cabinet
                ).length;
                const isSelected = activeCabinetConfig.cabinet === locCfg.cabinet;
                return (
                  <button
                    key={locCfg.id}
                    type="button"
                    onClick={() => setSelectedCabinetCode(locCfg.cabinet)}
                    className={`px-3.5 py-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/70 text-teal-950 ring-2 ring-teal-600/20'
                        : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold">
                        {locCfg.cabinet}
                      </span>
                      <Badge variant={isSelected ? 'teal' : 'neutral'}>{countInCab}</Badge>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {locCfg.cabinetLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Cabinet Physical View: Left Side and Right Side as Separate Physical Locations */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-slate-900">
                    {activeCabinetConfig.cabinet} — {activeCabinetConfig.cabinetLabel}
                  </span>
                  <Badge variant="teal">{activeCabinetConfig.storageClassification}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isFr
                    ? `Côté Gauche (${activeCabinetConfig.cabinet}- Level X- Left side) et Côté Droit (${activeCabinetConfig.cabinet}- Level X- Right side) sont séparés physiquement.`
                    : `Left Side (${activeCabinetConfig.cabinet}- Level X- Left side) and Right Side (${activeCabinetConfig.cabinet}- Level X- Right side) are separate physical compartments.`}
                </p>
              </div>

              {canManageLocations && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setAddingShelfToCab(activeCabinetConfig);
                      setNewAddedShelfName(String(activeCabinetConfig.shelves.length + 1));
                    }}
                  >
                    {isFr ? 'Ajouter un niveau' : 'Add level'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Pencil className="w-3.5 h-3.5" />}
                    onClick={() => openLocationEditor(activeCabinetConfig)}
                  >
                    {isFr ? 'Renommer / Configurer l’armoire' : 'Rename / Edit cabinet'}
                  </Button>
                </div>
              )}
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(['Left', 'Right'] as const).map((sideName) => {
                const sideContainers = filteredContainers.filter((c) => {
                  const f = extractPhysicalLocationFields(c.location);
                  return (
                    f.cabinet === activeCabinetConfig.cabinet && f.side === sideName
                  );
                });

                return (
                  <div
                    key={sideName}
                    className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          {activeCabinetConfig.cabinet} — {sideName} side
                        </h3>
                        <p className="text-xs text-slate-500">
                          {sideName === 'Left'
                            ? isFr
                              ? 'Compartiment Gauche (Left side)'
                              : 'Left side compartment'
                            : isFr
                            ? 'Compartiment Droit (Right side)'
                            : 'Right side compartment'}
                        </p>
                      </div>
                      <Badge variant={sideName === 'Left' ? 'teal' : 'info'}>
                        {sideContainers.length} {isFr ? 'réactifs' : 'reagents'}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      {activeCabinetConfig.shelves.map((shelfNum) => {
                        const shelfItems = sideContainers.filter(
                          (c) =>
                            extractPhysicalLocationFields(c.location).shelf === shelfNum
                        );
                        return (
                          <div
                            key={shelfNum}
                            className="bg-white border border-slate-200 rounded-lg p-3.5"
                          >
                            <div className="flex items-center justify-between mb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-slate-800">
                                  {activeCabinetConfig.cabinet}- Level {shelfNum}- {sideName} side
                                </span>
                                {canManageLocations && (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShelfEditTarget({
                                          cabinetId: activeCabinetConfig.id,
                                          cabinetCode: activeCabinetConfig.cabinet,
                                          oldShelf: shelfNum,
                                        });
                                        setNewShelfName(shelfNum);
                                      }}
                                      title={isFr ? 'Renommer ce niveau' : 'Rename level'}
                                      className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-slate-100 transition-colors"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    {activeCabinetConfig.shelves.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          try {
                                            deleteShelfFromCabinet({
                                              cabinetId: activeCabinetConfig.id,
                                              shelf: shelfNum,
                                            });
                                            setToast({
                                              type: 'success',
                                              text: isFr
                                                ? `Niveau "${shelfNum}" supprimé de ${activeCabinetConfig.cabinet}.`
                                                : `Level "${shelfNum}" removed from ${activeCabinetConfig.cabinet}.`,
                                            });
                                          } catch (err) {
                                            setToast({
                                              type: 'error',
                                              text: parseDisplayError(err),
                                            });
                                          }
                                        }}
                                        title={isFr ? 'Supprimer ce niveau' : 'Delete level'}
                                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-teal-700 font-mono font-semibold">
                                {activeCabinetConfig.cabinet}- Level {shelfNum}- {sideName} side
                              </span>
                            </div>

                            {shelfItems.length === 0 ? (
                              <div className="text-xs text-slate-400 py-2 italic">
                                {isFr
                                  ? 'Aucun réactif sur cette étagère'
                                  : 'No reagents on this shelf'}
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {shelfItems.map((item) => {
                                  const prod = productMap.get(item.productId);
                                  const f = extractPhysicalLocationFields(item.location);
                                  return (
                                    <button
                                      key={item.containerId}
                                      onClick={() => onSelectContainer(item.containerId)}
                                      className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-teal-600 hover:bg-teal-50/20 transition-all group"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-xs font-bold text-teal-800">
                                          Position {f.position}
                                        </span>
                                        <ContainerStatusBadge
                                          status={item.status}
                                          isFr={isFr}
                                        />
                                      </div>
                                      <div className="text-xs font-semibold text-slate-900 group-hover:text-teal-700 truncate mt-1">
                                        {prod?.chemicalName || item.productId}
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-1">
                                        <span>{item.containerId}</span>
                                        <span className="font-semibold text-slate-700">
                                          {item.currentQuantity} {item.unit}
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                        {f.code}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Consumption */}
      <Modal
        open={Boolean(consumeTarget)}
        onClose={() => setConsumeTarget(null)}
        title={isFr ? 'Enregistrer une consommation' : 'Record Consumption'}
        subtitle={
          consumeTarget
            ? `${
                productMap.get(consumeTarget.productId)?.chemicalName ||
                consumeTarget.productId
              } (${consumeTarget.containerId}) — ${consumeTarget.currentQuantity} ${
                consumeTarget.unit
              }`
            : ''
        }
      >
        <form onSubmit={handleQuickConsume} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr
                ? `Quantité prélevée (${consumeTarget?.unit})`
                : `Quantity used (${consumeTarget?.unit})`}
            </label>
            <input
              type="number"
              step="any"
              min="0.0001"
              max={consumeTarget?.currentQuantity}
              required
              value={consumeAmount}
              onChange={(e) => setConsumeAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Référence expérience / Motif' : 'Experiment Reference / Reason'}
            </label>
            <input
              type="text"
              required
              value={consumeReason}
              onChange={(e) => setConsumeReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Synthèse #LCSCO-204' : 'e.g. Synthesis batch #LCSCO-204'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConsumeTarget(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Enregistrer' : 'Confirm'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Controlled Quantity Adjustment (Director & Lab Engineer) with 2-Step Confirmation */}
      <Modal
        open={Boolean(adjustTarget)}
        onClose={() => {
          setAdjustTarget(null);
          setAdjConfirmStep(false);
        }}
        title={
          adjConfirmStep
            ? isFr
              ? 'Confirmer l’ajustement de quantité'
              : 'Confirm Quantity Adjustment'
            : isFr
            ? 'Ajuster la quantité'
            : 'Adjust Quantity'
        }
        subtitle={
          adjustTarget
            ? `${
                productMap.get(adjustTarget.productId)?.chemicalName ||
                adjustTarget.productId
              } (${adjustTarget.containerId})`
            : ''
        }
      >
        {adjustTarget && !adjConfirmStep && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAdjConfirmStep(true);
            }}
            className="space-y-4"
          >
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {isFr ? 'Quantité actuelle :' : 'Current quantity:'}
              </span>
              <span className="font-mono font-bold text-slate-900">
                {adjustTarget.currentQuantity} {adjustTarget.unit}
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr
                  ? `Nouvelle quantité (${adjustTarget.unit}) *`
                  : `New quantity (${adjustTarget.unit}) *`}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={adjNewQuantity}
                onChange={(e) => setAdjNewQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Motif de l’ajustement *' : 'Reason for adjustment *'}
              </label>
              <select
                value={adjReasonType}
                onChange={(e) =>
                  setAdjReasonType(e.target.value as StockAdjustmentReasonType)
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {STOCK_ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Commentaire (optionnel)' : 'Comment (optional)'}
              </label>
              <input
                type="text"
                value={adjComment}
                onChange={(e) => setAdjComment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdjustTarget(null)}
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary">
                {isFr ? 'Vérifier et confirmer' : 'Review & Confirm'}
              </Button>
            </div>
          </form>
        )}

        {adjustTarget && adjConfirmStep && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">{isFr ? 'Réactif :' : 'Reagent:'}</span>
                <span className="font-semibold text-slate-900">
                  {productMap.get(adjustTarget.productId)?.chemicalName ||
                    adjustTarget.productId}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">
                  {isFr ? 'Quantité précédente :' : 'Previous quantity:'}
                </span>
                <span className="font-mono font-semibold">
                  {adjustTarget.currentQuantity} {adjustTarget.unit}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">
                  {isFr ? 'Nouvelle quantité :' : 'New quantity:'}
                </span>
                <span className="font-mono font-bold text-teal-800">
                  {parseFloat(adjNewQuantity)} {adjustTarget.unit}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">
                  {isFr ? 'Différence :' : 'Difference:'}
                </span>
                <span className="font-mono font-bold">
                  {Math.round(
                    (parseFloat(adjNewQuantity) - adjustTarget.currentQuantity) * 10000
                  ) /
                    10000 >
                  0
                    ? '+'
                    : ''}
                  {Math.round(
                    (parseFloat(adjNewQuantity) - adjustTarget.currentQuantity) * 10000
                  ) / 10000}{' '}
                  {adjustTarget.unit}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-200/60 pt-2">
                <span className="text-slate-600">{isFr ? 'Motif :' : 'Reason:'}</span>
                <span className="font-medium text-slate-900">
                  {adjReasonType}
                  {adjComment ? ` — ${adjComment}` : ''}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAdjConfirmStep(false)}
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={submitting}
                onClick={handleConfirmQuickAdjust}
              >
                {isFr ? 'Confirmer l’ajustement' : 'Confirm adjustment'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Physical Location Configuration Editor */}
      <Modal
        open={Boolean(editingLocationConfig)}
        onClose={() => setEditingLocationConfig(null)}
        title={
          isFr
            ? 'Configurer une armoire de stockage (CAB X → Niveaux → Côté Gauche/Droit)'
            : 'Configure Storage Cabinet (CAB X → Levels → Left/Right side)'
        }
        subtitle={
          isFr
            ? 'Chaque armoire comporte un Côté Gauche (Left side) et un Côté Droit (Right side) distincts.'
            : 'Every cabinet automatically provides separate Left side and Right side physical compartments.'
        }
      >
        <form onSubmit={handleSaveLocationConfig} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Code Armoire (ex: CAB 1) *' : 'Cabinet Code (e.g. CAB 1) *'}
              </label>
              <input
                type="text"
                required
                value={locFormCabinet}
                onChange={(e) => setLocFormCabinet(e.target.value.toUpperCase())}
                placeholder="e.g. CAB 1, CAB 2, CAB 3, CAB 4"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Nom descriptif de l’armoire *' : 'Cabinet Descriptive Name *'}
              </label>
              <input
                type="text"
                required
                value={locFormLabel}
                onChange={(e) => setLocFormLabel(e.target.value)}
                placeholder="e.g. Cabinet 1 - Hallway (Salts Cabinet)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Classification de stockage' : 'Storage Classification'}
            </label>
            <select
              value={locFormStorageClass}
              onChange={(e) => setLocFormStorageClass(e.target.value)}
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
                {isFr
                  ? 'Étagères (séparées par des virgules)'
                  : 'Shelves (comma-separated)'}
              </label>
              <input
                type="text"
                required
                value={locFormShelves}
                onChange={(e) => setLocFormShelves(e.target.value)}
                placeholder="1, 2, 3, 4"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr
                  ? 'Positions par étagère (séparées par des virgules)'
                  : 'Positions per shelf (comma-separated)'}
              </label>
              <input
                type="text"
                required
                value={locFormPositions}
                onChange={(e) => setLocFormPositions(e.target.value)}
                placeholder="01, 02, 03, 04, 05, 06"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingLocationConfig &&
            physicalLocations.some((p) => p.id === editingLocationConfig.id) &&
            physicalLocations.length > 1 ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  deletePhysicalLocation(editingLocationConfig.id);
                  setEditingLocationConfig(null);
                }}
              >
                {isFr ? 'Supprimer cette armoire' : 'Delete cabinet'}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingLocationConfig(null)}
              >
                {isFr ? 'Annuler' : 'Cancel'}
              </Button>
              <Button type="submit" variant="primary">
                {isFr ? 'Enregistrer l’emplacement' : 'Save location'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal: Quick Rupture Report */}
      <Modal
        open={Boolean(ruptureTarget)}
        onClose={() => setRuptureTarget(null)}
        title={isFr ? 'Signaler une rupture de stock' : 'Report Stock Rupture'}
        subtitle={
          ruptureTarget
            ? `${
                productMap.get(ruptureTarget.productId)?.chemicalName ||
                ruptureTarget.productId
              } (${ruptureTarget.containerId})`
            : ''
        }
      >
        <form onSubmit={handleQuickRupture} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Niveau de priorité' : 'Priority Level'}
            </label>
            <select
              value={rupturePriority}
              onChange={(e) => setRupturePriority(e.target.value as NotificationPriority)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value={NotificationPriority.CRITICAL}>
                {isFr ? 'CRITIQUE — Rupture immédiate' : 'CRITICAL — Immediate stockout'}
              </option>
              <option value={NotificationPriority.HIGH}>
                {isFr ? 'HAUTE — Stock insuffisant' : 'HIGH — Insufficient stock'}
              </option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Commentaire' : 'Comment'}
            </label>
            <textarea
              rows={3}
              value={ruptureComment}
              onChange={(e) => setRuptureComment(e.target.value)}
              placeholder={
                isFr ? 'Observation physique...' : 'Physical observation...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRuptureTarget(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {isFr ? 'Signaler la rupture' : 'Submit report'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Quick Purchase Request */}
      <Modal
        open={Boolean(purchaseTarget)}
        onClose={() => setPurchaseTarget(null)}
        title={isFr ? 'Demander un achat' : 'Request Purchase'}
        subtitle={
          purchaseTarget
            ? productMap.get(purchaseTarget.productId)?.chemicalName ||
              purchaseTarget.productId
            : ''
        }
      >
        <form onSubmit={handleQuickPurchase} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr
                ? `Quantité souhaitée (${purchaseTarget?.unit})`
                : `Requested quantity (${purchaseTarget?.unit})`}
            </label>
            <input
              type="number"
              min="1"
              required
              value={purchaseQty}
              onChange={(e) => setPurchaseQty(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Justification' : 'Reason'}
            </label>
            <input
              type="text"
              required
              value={purchaseReason}
              onChange={(e) => setPurchaseReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Réapprovisionnement...' : 'e.g. Stock replenishment...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPurchaseTarget(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Envoyer la demande' : 'Submit request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Quick Disposal Request */}
      <Modal
        open={Boolean(disposalTarget)}
        onClose={() => setDisposalTarget(null)}
        title={isFr ? 'Demander l’élimination' : 'Request Disposal'}
        subtitle={disposalTarget?.containerId || ''}
      >
        <form onSubmit={handleQuickDisposal} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Motif d’élimination' : 'Disposal reason'}
            </label>
            <input
              type="text"
              required
              value={disposalReason}
              onChange={(e) => setDisposalReason(e.target.value)}
              placeholder={
                isFr ? 'ex. Produit périmé...' : 'e.g. Expired reagent...'
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDisposalTarget(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="danger" disabled={submitting}>
              {isFr ? 'Envoyer la demande' : 'Submit disposal request'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Rename Shelf in Cabinet */}
      <Modal
        open={Boolean(shelfEditTarget)}
        onClose={() => setShelfEditTarget(null)}
        title={isFr ? 'Renommer l’étagère' : 'Rename Shelf'}
        subtitle={
          shelfEditTarget
            ? `${shelfEditTarget.cabinetCode} — Shelf ${shelfEditTarget.oldShelf}`
            : ''
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRenameShelfSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Nouveau nom / numéro d’étagère *' : 'New shelf name / number *'}
            </label>
            <input
              type="text"
              required
              value={newShelfName}
              onChange={(e) => setNewShelfName(e.target.value)}
              placeholder="e.g. 1, 2, Top, Bottom, A1"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {isFr
                ? 'Tous les flacons placés sur cette étagère seront automatiquement mis à jour.'
                : 'All containers currently on this shelf will be automatically updated.'}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShelfEditTarget(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary">
              {isFr ? 'Enregistrer' : 'Save shelf name'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add New Shelf to Cabinet */}
      <Modal
        open={Boolean(addingShelfToCab)}
        onClose={() => setAddingShelfToCab(null)}
        title={isFr ? 'Ajouter une étagère à l’armoire' : 'Add Shelf to Cabinet'}
        subtitle={
          addingShelfToCab
            ? `Room ${addingShelfToCab.room} · ${addingShelfToCab.cabinet} (${addingShelfToCab.cabinetLabel})`
            : ''
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddShelfToCabinetSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isFr ? 'Nom ou numéro de la nouvelle étagère *' : 'New shelf name or number *'}
            </label>
            <input
              type="text"
              required
              value={newAddedShelfName}
              onChange={(e) => setNewAddedShelfName(e.target.value)}
              placeholder="e.g. 5, Top, A"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddingShelfToCab(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary">
              {isFr ? 'Ajouter l’étagère' : 'Add shelf'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Full Edit Reagent / Solvent / Salt (Director & Lab Engineer) */}
      <Modal
        open={Boolean(editItemTarget)}
        onClose={() => setEditItemTarget(null)}
        title={
          isFr
            ? 'Modifier les informations du réactif / solvant / sel'
            : 'Edit Reagent / Solvent / Salt Details'
        }
        subtitle={
          editItemTarget
            ? `${editChemName} (${editItemTarget.containerId})`
            : ''
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveFullEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Nom du produit chimique *' : 'Chemical Name *'}
              </label>
              <input
                type="text"
                required
                value={editChemName}
                onChange={(e) => setEditChemName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Code Flacon (ID) *' : 'Container ID *'}
              </label>
              <input
                type="text"
                required
                value={editContainerIdVal}
                onChange={(e) => setEditContainerIdVal(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Numéro CAS' : 'CAS Number'}
              </label>
              <input
                type="text"
                value={editCasNumber}
                onChange={(e) => setEditCasNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Formule chimique' : 'Formula'}
              </label>
              <input
                type="text"
                value={editFormula}
                onChange={(e) => setEditFormula(e.target.value)}
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
                value={editMolWeight}
                onChange={(e) => setEditMolWeight(e.target.value)}
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
                value={editChemClass}
                onChange={(e) => setEditChemClass(e.target.value)}
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
                value={editStorageClass}
                onChange={(e) => setEditStorageClass(e.target.value)}
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Quantité actuelle *' : 'Current Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={editCurrentQty}
                onChange={(e) => setEditCurrentQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Capacité initiale *' : 'Initial Quantity *'}
              </label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={editInitialQty}
                onChange={(e) => setEditInitialQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Unité' : 'Unit'}
              </label>
              <select
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value as ChemicalUnit)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {Object.values(ChemicalUnit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Stock minimum' : 'Min Stock'}
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={editMinStock}
                onChange={(e) => setEditMinStock(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          {/* Physical Location Selectors inside Full Edit */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="text-xs font-semibold text-slate-800">
              {isFr
                ? 'Emplacement Physique (CAB X- Level Y- Left/Right side)'
                : 'Physical Location (CAB X- Level Y- Left/Right side)'}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Armoire (Cabinet)' : 'Cabinet'}
                </label>
                <select
                  value={editCabinet}
                  onChange={(e) => setEditCabinet(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {physicalLocations.map((p) => (
                    <option key={p.id} value={p.cabinet}>
                      {p.cabinet} ({p.cabinetLabel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Niveau (Level)' : 'Level'}
                </label>
                <select
                  value={editShelf}
                  onChange={(e) => setEditShelf(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {(
                    physicalLocations.find((p) => p.cabinet === editCabinet)?.shelves || [
                      '1',
                      '2',
                      '3',
                      '4',
                      '5',
                    ]
                  ).map((sh) => (
                    <option key={sh} value={sh}>
                      Level {sh}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Côté (Side)' : 'Side'}
                </label>
                <select
                  value={editSide}
                  onChange={(e) => setEditSide(e.target.value as 'Left' | 'Right')}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="Left">Left side</option>
                  <option value="Right">Right side</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  {isFr ? 'Position' : 'Position'}
                </label>
                <select
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {(
                    physicalLocations.find((p) => p.cabinet === editCabinet)?.positions || [
                      '01',
                      '02',
                      '03',
                      '04',
                      '05',
                      '06',
                    ]
                  ).map((pos) => (
                    <option key={pos} value={pos}>
                      Pos {pos}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Fournisseur' : 'Supplier'}
              </label>
              <input
                type="text"
                value={editSupplier}
                onChange={(e) => setEditSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Numéro de lot' : 'Lot Number'}
              </label>
              <input
                type="text"
                value={editLotNumber}
                onChange={(e) => setEditLotNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {isFr ? 'Date d’expiration' : 'Expiry Date'}
              </label>
              <input
                type="date"
                value={editExpiryDate}
                onChange={(e) => setEditExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditItemTarget(null)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {isFr ? 'Enregistrer toutes les modifications' : 'Save all changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Confirm Delete Reagent */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={isFr ? 'Supprimer ce réactif ?' : 'Delete Reagent?'}
        subtitle={
          deleteTarget
            ? `${productMap.get(deleteTarget.productId)?.chemicalName || deleteTarget.productId} (${deleteTarget.containerId})`
            : ''
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {isFr
              ? 'Êtes-vous sûr de vouloir supprimer définitivement ce flacon de l’inventaire ?'
              : 'Are you sure you want to permanently delete this reagent container from the inventory?'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteContainer}>
              {isFr ? 'Supprimer définitivement' : 'Delete reagent'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirm Delete All Reagents & Cabinets */}
      <Modal
        open={confirmClearAllOpen}
        onClose={() => setConfirmClearAllOpen(false)}
        title={
          isFr
            ? 'Supprimer tous les réactifs et toutes les armoires ?'
            : 'Delete All Reagents & Cabinets?'
        }
        subtitle={
          isFr
            ? 'Cette action vide intégralement les réactifs et armoires.'
            : 'This action wipes all existing reagents and cabinets so you can start fresh.'
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {isFr
              ? 'Confirmez-vous la suppression de tous les réactifs et de toutes les armoires de stockage ?'
              : 'Are you sure you want to delete all reagents and all storage cabinets?'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmClearAllOpen(false)}>
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button
              variant="danger"
              disabled={submitting}
              onClick={handleConfirmClearAllInventory}
            >
              {isFr ? 'Tout supprimer' : 'Delete All'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Import Real Inventory (PDF / Image / CSV / Text) */}
      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title={
          isFr
            ? 'Importer l’inventaire réel du laboratoire'
            : 'Import Real Laboratory Inventory'
        }
        subtitle={
          isFr
            ? 'Crée automatiquement les armoires et attache chaque réactif avec son armoire, son niveau et son côté (ex: CAB 1- Level 1- Right side).'
            : 'Automatically creates the appropriate cabinets and attaches each reagent with its cabinet, level, and side (e.g. CAB 1- Level 1- Right side).'
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleImportRealInventorySubmit} className="space-y-4">
          <div className="rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-4 space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              {isFr
                ? '1. Joindre le fichier d’inventaire (PDF, Image, CSV, TXT)'
                : '1. Attach Inventory File (PDF, Image, CSV, TXT)'}
            </label>
            <input
              type="file"
              accept=".pdf,image/*,.csv,.txt"
              onChange={handleFileChangeForImport}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white hover:file:bg-teal-800 cursor-pointer"
            />
            {importFileName && (
              <div className="text-xs text-teal-800 font-mono">
                {isFr ? 'Fichier sélectionné :' : 'Selected file:'} {importFileName}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              {isFr
                ? '2. Ou coller la liste d’inventaire (Optionnel)'
                : '2. Or Paste Inventory List / Table Text (Optional)'}
            </label>
            <textarea
              rows={5}
              value={importRawText}
              onChange={(e) => setImportRawText(e.target.value)}
              placeholder={
                isFr
                  ? 'Exemple :\nCAB 1 - Level 1 - Right side : Ethanol 2500 mL, Acetone 1000 mL\nCAB 1 - Level 2 - Left side : Methanol 2500 mL...'
                  : 'Example:\nCAB 1 - Level 1 - Right side: Ethanol 2500 mL, Acetone 1000 mL\nCAB 1 - Level 2 - Left side: Methanol 2500 mL...'
              }
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between">
            <span>
              {isFr ? 'Format du code généré :' : 'Generated location code format:'}
            </span>
            <span className="font-mono font-bold text-teal-800">
              CAB 1- Level 1- Right side
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportModalOpen(false)}
            >
              {isFr ? 'Annuler' : 'Cancel'}
            </Button>
            <Button type="submit" variant="primary" disabled={importingInventory}>
              {importingInventory
                ? isFr
                  ? 'Analyse et création en cours...'
                  : 'Analyzing & Creating Cabinets...'
                : isFr
                ? 'Créer les armoires et importer les réactifs'
                : 'Create Cabinets & Import Reagents'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
