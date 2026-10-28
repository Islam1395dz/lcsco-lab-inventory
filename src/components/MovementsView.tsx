import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Repeat,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  addChemicalStock,
  transferContainerLocation,
  withdrawChemicalStock,
} from '../services/inventoryService';
import {
  buildStorageLocation,
  calculateAdditionMutation,
  calculateWithdrawalMutation,
} from '../services/inventoryDomain';
import { LCSCO_PLACEMENT_ZONES } from '../services/chemicalCompatibilityService';
import {
  PermissionAction,
  TransactionType,
} from '../types/inventory';
import {
  formatShortRoleName,
  formatTimestamp,
  TransactionTypeLabel,
} from '../utils/formatters';
import { parseDisplayError } from '../firebase';
import { Button, PageHeader } from './DesignSystem';

interface MovementsViewProps {
  onSelectContainer: (containerId: string) => void;
  onOpenCalculator: () => void;
}

type MovementTab = 'WITHDRAW' | 'ADD' | 'ADJUST' | 'TRANSFER';

export const MovementsView: React.FC<MovementsViewProps> = ({
  onSelectContainer,
  onOpenCalculator,
}) => {
  const {
    profile,
    isPreviewMode,
    updatePreviewState,
    containers,
    products,
    transactions,
    canPerform,
    submitStockAdjustmentRequest,
    isAdmin,
  } = useInventoryContext();

  const { tr } = useLanguage();

  const [activeTab, setActiveTab] = useState<MovementTab>('WITHDRAW');
  const [selectedContainerId, setSelectedContainerId] = useState<string>(
    containers[0]?.containerId || 'SOL-001'
  );
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Transfer fields
  const [targetRoom, setTargetRoom] = useState<string>('204');
  const [targetBox, setTargetBox] = useState<string>('FLAM-A');
  const [targetShelf, setTargetShelf] = useState<string>('S2');
  const [targetPos, setTargetPos] = useState<string>('P01');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const productMap = React.useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const selectedContainer =
    containers.find((c) => c.containerId === selectedContainerId) || containers[0];
  const selectedProduct = selectedContainer
    ? productMap.get(selectedContainer.productId)
    : undefined;

  const parsedAmount = parseFloat(amount);
  const validDelta = !isNaN(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;

  const projectedQuantity = React.useMemo(() => {
    if (!selectedContainer) return 0;
    if (activeTab === 'WITHDRAW') {
      return Math.round((selectedContainer.currentQuantity - validDelta) * 10000) / 10000;
    }
    if (activeTab === 'ADD') {
      return Math.round((selectedContainer.currentQuantity + validDelta) * 10000) / 10000;
    }
    if (activeTab === 'ADJUST') {
      return validDelta;
    }
    return selectedContainer.currentQuantity;
  }, [selectedContainer, activeTab, validDelta]);

  const handleMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedContainer) return;
    setFeedback(null);
    setSubmitting(true);

    try {
      const actor = {
        uid: profile.uid,
        fullName: `${profile.fullName} (${formatShortRoleName(profile.role)})`,
        role: profile.role,
      };

      if (activeTab === 'WITHDRAW') {
        const num = parseFloat(amount);
        if (isPreviewMode) {
          const calc = calculateWithdrawalMutation(
            selectedContainer,
            num,
            selectedContainer.unit,
            reason
          );
          const txId = `WD-${Date.now().toString(36).toUpperCase()}`;
          updatePreviewState({
            containers: containers.map((c) =>
              c.containerId === selectedContainer.containerId
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
                userId: actor.uid,
                userName: actor.fullName,
                userRole: actor.role,
                laboratoryId: selectedContainer.laboratoryId,
                containerId: selectedContainer.containerId,
                productId: selectedContainer.productId,
                quantityChange: calc.quantityChange,
                quantityBefore: calc.quantityBefore,
                quantityAfter: calc.quantityAfter,
                unit: selectedContainer.unit,
                oldLocation: selectedContainer.location.code,
                newLocation: selectedContainer.location.code,
                oldStatus: calc.oldStatus,
                newStatus: calc.newStatus,
                reason: reason.trim(),
              },
              ...transactions,
            ],
          });
          setFeedback({
            type: 'success',
            message: tr(
              `Recorded consumption: −${num} ${selectedContainer.unit} (${calc.quantityBefore} → ${calc.quantityAfter} ${selectedContainer.unit}).`,
              `Consommation enregistrée : −${num} ${selectedContainer.unit} (${calc.quantityBefore} → ${calc.quantityAfter} ${selectedContainer.unit}).`
            ),
          });
        } else {
          const res = await withdrawChemicalStock({
            containerId: selectedContainer.containerId,
            amount: num,
            unit: selectedContainer.unit,
            reason,
            actor,
          });
          setFeedback({
            type: 'success',
            message: `−${num} ${selectedContainer.unit} → ${res.newQuantity} ${selectedContainer.unit}`,
          });
        }
      } else if (activeTab === 'ADD') {
        if (!canPerform(PermissionAction.RECORD_STOCK_ADDITION)) {
          throw new Error(
            tr(
              'Only the Director, Secretary, or Technician can record stock additions.',
              'Seul le Directeur, le Secrétaire ou le Technicien peut enregistrer des entrées de stock.'
            )
          );
        }
        const num = parseFloat(amount);
        if (isPreviewMode) {
          const calc = calculateAdditionMutation(
            selectedContainer,
            num,
            selectedContainer.unit,
            reason
          );
          const txId = `ADD-${Date.now().toString(36).toUpperCase()}`;
          updatePreviewState({
            containers: containers.map((c) =>
              c.containerId === selectedContainer.containerId
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
                type: TransactionType.ADDITION,
                timestamp: new Date().toISOString(),
                userId: actor.uid,
                userName: actor.fullName,
                userRole: actor.role,
                laboratoryId: selectedContainer.laboratoryId,
                containerId: selectedContainer.containerId,
                productId: selectedContainer.productId,
                quantityChange: calc.quantityChange,
                quantityBefore: calc.quantityBefore,
                quantityAfter: calc.quantityAfter,
                unit: selectedContainer.unit,
                oldLocation: selectedContainer.location.code,
                newLocation: selectedContainer.location.code,
                oldStatus: calc.oldStatus,
                newStatus: calc.newStatus,
                reason: reason.trim(),
              },
              ...transactions,
            ],
          });
          setFeedback({
            type: 'success',
            message: tr(
              `Recorded stock entry: +${num} ${selectedContainer.unit} (${calc.quantityBefore} → ${calc.quantityAfter} ${selectedContainer.unit}).`,
              `Entrée de stock enregistrée : +${num} ${selectedContainer.unit} (${calc.quantityBefore} → ${calc.quantityAfter} ${selectedContainer.unit}).`
            ),
          });
        } else {
          const res = await addChemicalStock({
            containerId: selectedContainer.containerId,
            amount: num,
            unit: selectedContainer.unit,
            reason,
            actor,
          });
          setFeedback({
            type: 'success',
            message: `+${num} ${selectedContainer.unit} → ${res.newQuantity} ${selectedContainer.unit}`,
          });
        }
      } else if (activeTab === 'ADJUST') {
        const measured = parseFloat(amount);
        submitStockAdjustmentRequest({
          containerId: selectedContainer.containerId,
          measuredQuantity: measured,
          unit: selectedContainer.unit,
          reason,
        });
        setFeedback({
          type: 'success',
          message: isAdmin
            ? tr(
                'Physical count adjustment applied directly.',
                'Ajustement après inventaire physique appliqué directement.'
              )
            : tr(
                'Stock adjustment submitted for Director approval.',
                'Demande d’ajustement soumise à l’approbation du Directeur.'
              ),
        });
      } else if (activeTab === 'TRANSFER') {
        const newLoc = buildStorageLocation({
          building: 'LCSCO',
          room: targetRoom,
          unit: targetBox,
          shelf: targetShelf,
          position: targetPos,
        });
        if (isPreviewMode) {
          const txId = `TRF-${Date.now().toString(36).toUpperCase()}`;
          updatePreviewState({
            containers: containers.map((c) =>
              c.containerId === selectedContainer.containerId
                ? {
                    ...c,
                    location: newLoc,
                    updatedAt: new Date().toISOString(),
                  }
                : c
            ),
            transactions: [
              {
                transactionId: txId,
                type: TransactionType.TRANSFER,
                timestamp: new Date().toISOString(),
                userId: actor.uid,
                userName: actor.fullName,
                userRole: actor.role,
                laboratoryId: selectedContainer.laboratoryId,
                containerId: selectedContainer.containerId,
                productId: selectedContainer.productId,
                quantityChange: 0,
                quantityBefore: selectedContainer.currentQuantity,
                quantityAfter: selectedContainer.currentQuantity,
                unit: selectedContainer.unit,
                oldLocation: selectedContainer.location.code,
                newLocation: newLoc.code,
                oldStatus: selectedContainer.status,
                newStatus: selectedContainer.status,
                reason: reason.trim(),
              },
              ...transactions,
            ],
          });
        } else {
          await transferContainerLocation({
            containerId: selectedContainer.containerId,
            newLocationInput: {
              building: 'LCSCO',
              room: targetRoom,
              unit: targetBox,
              shelf: targetShelf,
              position: targetPos,
            },
            newLaboratoryId: selectedContainer.laboratoryId,
            newStorageCondition: selectedContainer.storageCondition,
            reason,
            actor,
          });
        }
        setFeedback({
          type: 'success',
          message: tr(
            `Moved ${selectedContainer.containerId} to ${newLoc.code}.`,
            `Flacon ${selectedContainer.containerId} déplacé vers ${newLoc.code}.`
          ),
        });
      }

      setAmount('');
      setReason('');
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={tr('Stock Movements', 'Mouvements de stock')}
        subtitle={tr(
          'Record chemical consumption, stock entries, location transfers, and physical inventory counts.',
          'Enregistrez les prélèvements, entrées de stock, transferts d’emplacement et comptages d’inventaire.'
        )}
        actions={
          <Button variant="secondary" onClick={onOpenCalculator}>
            <Calculator className="w-3.5 h-3.5 text-[#1B8A2A]" />
            <span>{tr('Molarity & Stoichiometry Calculator', 'Calculateur de synthèse')}</span>
          </Button>
        }
      />

      {feedback && (
        <div
          className={`p-4 border rounded-md text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline font-mono ml-4 cursor-pointer"
          >
            {tr('Dismiss', 'Fermer')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Structured Movement Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md overflow-hidden">
          {/* Operation Selector Tabs */}
          <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/70 px-3 pt-2 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('WITHDRAW')}
              className={`px-3.5 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'WITHDRAW'
                  ? 'border-[#1B8A2A] text-slate-900 bg-white font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
              <span>{tr('Consumption / Withdrawal', 'Sortie / Consommation')}</span>
            </button>

            {canPerform(PermissionAction.RECORD_STOCK_ADDITION) && (
              <button
                type="button"
                onClick={() => setActiveTab('ADD')}
                className={`px-3.5 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'ADD'
                    ? 'border-[#1B8A2A] text-slate-900 bg-white font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                <span>{tr('Stock Entry', 'Entrée de stock')}</span>
              </button>
            )}

            {canPerform(PermissionAction.SUBMIT_STOCK_ADJUSTMENT) && (
              <button
                type="button"
                onClick={() => setActiveTab('ADJUST')}
                className={`px-3.5 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'ADJUST'
                    ? 'border-[#1B8A2A] text-slate-900 bg-white font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>{tr('Physical Inventory Count', 'Ajustement / Inventaire')}</span>
              </button>
            )}

            {canPerform(PermissionAction.MOVE_BETWEEN_LOCATIONS) && (
              <button
                type="button"
                onClick={() => setActiveTab('TRANSFER')}
                className={`px-3.5 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'TRANSFER'
                    ? 'border-[#1B8A2A] text-slate-900 bg-white font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Repeat className="w-3.5 h-3.5 text-slate-600" />
                <span>{tr('Location Transfer', 'Transfert d’emplacement')}</span>
              </button>
            )}
          </div>

          <form onSubmit={handleMovementSubmit} className="p-6 space-y-5 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1.5">
                {tr('Select Reagent Bottle *', 'Sélectionner le flacon *')}
              </label>
              <select
                value={selectedContainerId}
                onChange={(e) => setSelectedContainerId(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md bg-white focus:outline-none focus:border-[#1B8A2A]"
              >
                {containers.map((c) => {
                  const p = productMap.get(c.productId);
                  return (
                    <option key={c.containerId} value={c.containerId}>
                      {c.containerId} — {p?.chemicalName || c.productId} ({c.currentQuantity}{' '}
                      {c.unit} · {c.location.unit})
                    </option>
                  );
                })}
              </select>
            </div>

            {activeTab !== 'TRANSFER' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1.5">
                    {activeTab === 'WITHDRAW'
                      ? tr('Quantity Consumed *', 'Quantité prélevée *')
                      : activeTab === 'ADD'
                      ? tr('Quantity Added *', 'Quantité ajoutée *')
                      : tr('Measured Physical Quantity *', 'Quantité physique mesurée *')}{' '}
                    ({selectedContainer?.unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={activeTab === 'ADJUST' ? '0' : '0.0001'}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                  />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex flex-col justify-center">
                  <span className="text-[11px] text-slate-500">
                    {tr('Balance Preview', 'Aperçu du solde')}
                  </span>
                  <div className="font-mono text-sm tabular-nums text-slate-900 mt-0.5">
                    {selectedContainer?.currentQuantity} {selectedContainer?.unit} →{' '}
                    <strong className="text-[#1B8A2A]">
                      {projectedQuantity} {selectedContainer?.unit}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Room', 'Salle')}
                  </label>
                  <input
                    type="text"
                    required
                    value={targetRoom}
                    onChange={(e) => setTargetRoom(e.target.value)}
                    className="w-full px-2.5 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Storage Cabinet', 'Armoire')}
                  </label>
                  <select
                    value={targetBox}
                    onChange={(e) => setTargetBox(e.target.value)}
                    className="w-full px-2.5 py-2 font-mono border border-slate-300 rounded-md bg-white"
                  >
                    {LCSCO_PLACEMENT_ZONES.map((z) => (
                      <option key={z.unit} value={z.unit}>
                        {z.unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Shelf', 'Étagère')}
                  </label>
                  <input
                    type="text"
                    required
                    value={targetShelf}
                    onChange={(e) => setTargetShelf(e.target.value)}
                    className="w-full px-2.5 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {tr('Position', 'Position')}
                  </label>
                  <input
                    type="text"
                    required
                    value={targetPos}
                    onChange={(e) => setTargetPos(e.target.value)}
                    className="w-full px-2.5 py-2 font-mono border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-medium text-slate-700 mb-1.5">
                {tr('Experiment Reference / Reason *', 'Référence d’expérience / Motif *')}
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={tr(
                  'e.g. Catalytic hydrogenation #EXP-204',
                  'ex. Hydrogénation catalytique #EXP-204'
                )}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
              />
            </div>

            <div className="pt-2 flex items-center justify-between">
              {selectedContainer && (
                <button
                  type="button"
                  onClick={() => onSelectContainer(selectedContainer.containerId)}
                  className="text-xs font-mono text-slate-500 hover:text-slate-900 underline cursor-pointer"
                >
                  {tr(
                    `Inspect ${selectedContainer.containerId} (${selectedProduct?.formula || ''})`,
                    `Voir la fiche ${selectedContainer.containerId} (${selectedProduct?.formula || ''})`
                  )}
                </button>
              )}

              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting
                  ? tr('Recording...', 'Enregistrement...')
                  : activeTab === 'WITHDRAW'
                  ? tr('Record Consumption', 'Enregistrer la sortie')
                  : activeTab === 'ADD'
                  ? tr('Record Stock Entry', 'Enregistrer l’entrée')
                  : activeTab === 'ADJUST'
                  ? tr('Submit Inventory Count', 'Valider le comptage')
                  : tr('Confirm Transfer', 'Confirmer le transfert')}
              </Button>
            </div>
          </form>
        </div>

        {/* Right: Recent Stock Movements Summary */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              {tr('Recent Movements', 'Derniers mouvements')}
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {transactions.length} {tr('total', 'au total')}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-md divide-y divide-slate-100">
            {transactions.slice(0, 6).map((tx) => {
              const prod = productMap.get(tx.productId);
              return (
                <div
                  key={tx.transactionId}
                  onClick={() => onSelectContainer(tx.containerId)}
                  className="p-3.5 hover:bg-slate-50 transition-colors cursor-pointer space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-slate-900">
                        {tx.containerId}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-slate-800 truncate">
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
                    <span className="truncate max-w-[220px]">{tx.reason}</span>
                    <span className="font-mono shrink-0">
                      {tx.userName.split('(')[0].trim()} · {formatTimestamp(tx.timestamp).split(',')[0]}
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
