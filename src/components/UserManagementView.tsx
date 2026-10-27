import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  MailCheck,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserProfile, UserRole, UserStatus } from '../types/inventory';
import { formatRoleLabel, LCSCO_FOUR_ACCOUNT_ROLES } from '../utils/formatters';
import {
  createLabMemberProfile,
  deleteLabMemberProfile,
  updateUserPermissions,
} from '../services/inventoryService';
import {
  deleteLabMemberAccount,
  provisionLabMemberAccount,
  repairMemberAccess,
  resendWelcomeEmail,
  type ProvisionedAccount,
} from '../services/adminAccountService';
import { parseDisplayError } from '../firebase';
import { Button, PageHeader } from './DesignSystem';

export const UserManagementView: React.FC = () => {
  const {
    profile,
    firebaseUser,
    isPreviewMode,
    updatePreviewState,
    products,
    containers,
    allUsers,
    isAdmin,
    signOut,
  } = useInventoryContext();

  const { language, tr } = useLanguage();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<'USERS' | 'CATALOG'>('USERS');
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>(UserRole.PHD_STUDENT);

  /** One-time display of the temporary password returned by the provisioning API. */
  const [provisionedAccount, setProvisionedAccount] = useState<ProvisionedAccount | null>(null);
  const [copiedTempPassword, setCopiedTempPassword] = useState(false);
  /** Member whose welcome email is currently being re-issued. */
  const [resendingUid, setResendingUid] = useState<string | null>(null);
  /** Member whose sign-in access is currently being repaired. */
  const [repairingUid, setRepairingUid] = useState<string | null>(null);
  /** Distinguishes a fresh provisioning from a re-issued invitation in the credentials modal. */
  const [credentialsReason, setCredentialsReason] = useState<'created' | 'resent'>('created');

  const productAggregateStock = React.useMemo(() => {
    const map = new Map<string, number>();
    containers.forEach((c) => {
      const current = map.get(c.productId) || 0;
      map.set(c.productId, Math.round((current + c.currentQuantity) * 10000) / 10000);
    });
    return map;
  }, [containers]);

  const handleCreateMemberProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setFeedback(null);

    try {
      if (!isAdmin) {
        throw new Error(
          tr(
            'Only the Director can add or remove profiles.',
            'Seul le Directeur peut ajouter ou supprimer des profils.'
          )
        );
      }

      if (!isPreviewMode) {
        // REAL MODE: the server creates the Firebase Auth account with a
        // server-generated temporary password, writes the profile doc, and
        // emails the first-login credentials to the new member.
        const provisioned = await provisionLabMemberAccount({
          email: newMemberEmail.trim(),
          fullName: newMemberName.trim(),
          role: newMemberRole,
          laboratoryIds: ['LCSCO'],
        });
        setProvisionedAccount(provisioned);
        setCredentialsReason('created');
        setShowAddUserModal(false);
        setNewMemberName('');
        setNewMemberEmail('');
        return;
      }

      // PREVIEW MODE: no real credentials are involved; the provisional
      // profile lives in local state only.
      const generatedUid = `LCSCO-${Date.now().toString(36).toUpperCase()}`;
      let createdUid = generatedUid;

      const actorUid = firebaseUser?.uid || profile.uid;
      try {
        createdUid = await createLabMemberProfile({
          uid: generatedUid,
          fullName: newMemberName.trim(),
          email: newMemberEmail.trim(),
          role: newMemberRole,
          laboratoryIds: ['LCSCO'],
          status: UserStatus.ACTIVE,
          actor: {
            uid: actorUid,
            fullName: profile.fullName || 'Director',
            role: profile.role || UserRole.ADMIN,
          },
        });
      } catch (fsErr) {
        console.warn('createLabMemberProfile error:', fsErr);
      }

      const createdUser: UserProfile = {
        uid: createdUid || generatedUid,
        fullName: newMemberName.trim(),
        email: newMemberEmail.trim(),
        role: newMemberRole,
        laboratoryIds: ['LCSCO'],
        status: UserStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      updatePreviewState({
        users: [...allUsers.filter((u) => u.uid !== createdUser.uid), createdUser],
      });

      setFeedback({
        type: 'success',
        message: tr(
          `Added preview user ${newMemberName} (${formatRoleLabel(newMemberRole, language)}). Preview users are local-only.`,
          `Utilisateur d'aperçu ${newMemberName} ajouté (${formatRoleLabel(newMemberRole, language)}). Les comptes d'aperçu sont locaux.`
        ),
      });
      setNewMemberName('');
      setNewMemberEmail('');
      setShowAddUserModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleResendWelcomeEmail = async (targetUser: UserProfile) => {
    if (!profile) return;
    setFeedback(null);
    setResendingUid(targetUser.uid);
    try {
      const reissued = await resendWelcomeEmail(targetUser.uid);
      setCredentialsReason('resent');
      setProvisionedAccount(reissued);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setResendingUid(null);
    }
  };

  /**
   * Repairs the "can read but cannot write" state: the member's Auth record was
   * created without a verified email, so the Firestore rules refuse every
   * stock movement. The server flips the flag; the member must sign out and
   * back in for the new claim to reach their ID token.
   */
  const handleRepairAccess = async (targetUser: UserProfile) => {
    if (!profile) return;
    setFeedback(null);
    setRepairingUid(targetUser.uid);
    try {
      await repairMemberAccess(targetUser.uid);
      setFeedback({
        type: 'success',
        message: tr(
          `Sign-in access repaired for "${targetUser.fullName}". Ask them to sign out and sign in again.`,
          `Accès réparé pour « ${targetUser.fullName} ». Demandez-lui de se déconnecter puis de se reconnecter.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    } finally {
      setRepairingUid(null);
    }
  };

  const handleRemoveMemberProfile = async (targetUser: UserProfile) => {
    if (!profile) return;
    setFeedback(null);

    try {
      if (targetUser.uid === profile.uid) {
        throw new Error(
          tr(
            'Cannot remove your own active Director profile.',
            'Impossible de supprimer votre propre profil Directeur actif.'
          )
        );
      }

      if (!isPreviewMode) {
        // REAL MODE: this deletes BOTH the Firebase Auth account and the
        // Firestore profile via the server (a profile-only deletion would
        // leave an orphaned, still-signable Auth account behind).
        await deleteLabMemberAccount(targetUser.uid);
        setFeedback({
          type: 'success',
          message: tr(
            `Deleted account "${targetUser.fullName}" (auth membership and profile).`,
            `Compte supprimé : « ${targetUser.fullName} » (identité d'authentification et profil).`
          ),
        });
        return;
      }

      try {
        await deleteLabMemberProfile({
          targetUid: targetUser.uid,
          actor: {
            uid: profile.uid,
            fullName: profile.fullName,
            role: profile.role,
          },
        });
      } catch (firestoreErr) {
        if (!firebaseUser) {
          updatePreviewState({
            users: allUsers.filter((u) => u.uid !== targetUser.uid),
          });
        } else {
          throw firestoreErr;
        }
      }

      setFeedback({
        type: 'success',
        message: tr(
          `Removed profile "${targetUser.fullName}".`,
          `Profil « ${targetUser.fullName} » supprimé.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleRoleChange = async (
    targetUid: string,
    newRole: UserRole,
    currentStatus: UserStatus
  ) => {
    setFeedback(null);
    try {
      try {
        await updateUserPermissions({
          targetUid,
          role: newRole,
          status: currentStatus,
          laboratoryIds: ['LCSCO'],
        });
      } catch (firestoreErr) {
        if (!firebaseUser) {
          updatePreviewState({
            users: allUsers.map((u) =>
              u.uid === targetUid ? { ...u, role: newRole, laboratoryIds: ['LCSCO'] } : u
            ),
            currentProfile: profile?.uid === targetUid ? { role: newRole } : undefined,
          });
        } else {
          throw firestoreErr;
        }
      }
      setFeedback({
        type: 'success',
        message: tr(
          `Updated role to ${formatRoleLabel(newRole, language)}.`,
          `Rôle mis à jour vers ${formatRoleLabel(newRole, language)}.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  const handleToggleUserStatus = async (targetUser: UserProfile) => {
    setFeedback(null);
    try {
      if (targetUser.uid === profile?.uid) {
        throw new Error(
          tr(
            'Cannot deactivate your own active Director session.',
            'Impossible de désactiver votre propre session Directeur.'
          )
        );
      }
      const nextStatus =
        targetUser.status === UserStatus.DEACTIVATED
          ? UserStatus.ACTIVE
          : UserStatus.DEACTIVATED;

      try {
        await updateUserPermissions({
          targetUid: targetUser.uid,
          role: targetUser.role,
          status: nextStatus,
          laboratoryIds: targetUser.laboratoryIds || ['LCSCO'],
        });
      } catch (firestoreErr) {
        if (!firebaseUser) {
          updatePreviewState({
            users: allUsers.map((u) =>
              u.uid === targetUser.uid ? { ...u, status: nextStatus } : u
            ),
          });
        } else {
          throw firestoreErr;
        }
      }
      setFeedback({
        type: 'success',
        message: tr(
          `Account "${targetUser.fullName}" is now ${nextStatus}.`,
          `Le compte « ${targetUser.fullName} » est maintenant ${nextStatus}.`
        ),
      });
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-md text-center space-y-3 max-w-md mx-auto">
        <Lock className="w-6 h-6 text-rose-500 mx-auto" />
        <div className="text-sm font-semibold text-slate-900">
          {tr('Director Access Required', 'Accès réservé au Directeur')}
        </div>
        <p className="text-xs text-slate-600">
          {tr(
            'Only the Director can manage users and roles.',
            'Seul le Directeur peut gérer les utilisateurs et les rôles.'
          )}
        </p>
        <Button variant="primary" onClick={signOut}>
          {tr('Sign Out to Login Page', 'Se déconnecter')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr('Users & Roles', 'Utilisateurs & Rôles')}
        subtitle={tr(
          'Manage laboratory accounts, assign permissions, and review the chemical catalog.',
          'Gérez les comptes du laboratoire, attribuez les rôles et consultez le catalogue chimique.'
        )}
        actions={
          <Button variant="primary" onClick={() => setShowAddUserModal(true)}>
            <Plus className="w-3.5 h-3.5" />
            <span>{tr('Add User', 'Nouvel utilisateur')}</span>
          </Button>
        }
      />

      {feedback && (
        <div
          className={`p-3.5 border rounded-md text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-mono underline cursor-pointer ml-3"
          >
            {tr('Dismiss', 'Fermer')}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('USERS')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            activeTab === 'USERS'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('User Accounts', 'Comptes utilisateurs')} ({allUsers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CATALOG')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            activeTab === 'CATALOG'
              ? 'bg-slate-900 text-white font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tr('Chemical Catalog', 'Catalogue chimique')} ({products.length})
        </button>
      </div>

      {activeTab === 'USERS' ? (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Name', 'Nom')}</th>
                  <th className="py-2.5 px-4">E-mail</th>
                  <th className="py-2.5 px-4">{tr('Role', 'Rôle')}</th>
                  <th className="py-2.5 px-4">{tr('Status', 'Statut')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUsers.map((u) => {
                  const isSelf = u.uid === profile?.uid;
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{u.fullName}</span>
                          {u.mustChangePassword && !isSelf && (
                            <span
                              className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap"
                              title={tr(
                                'This member has not completed their first login yet. The temporary password is still pending.',
                                "Ce membre n'a pas encore terminé sa première connexion. Le mot de passe temporaire est toujours en attente."
                              )}
                            >
                              <Lock className="w-2.5 h-2.5 mr-0.5" />
                              {tr('Temporary password', 'Mot de passe temporaire')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {u.email}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.uid, e.target.value as UserRole, u.status)
                          }
                          className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-md bg-white"
                        >
                          {LCSCO_FOUR_ACCOUNT_ROLES.map((roleOpt) => (
                            <option key={roleOpt} value={roleOpt}>
                              {formatRoleLabel(roleOpt, language)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            u.status === UserStatus.DEACTIVATED
                              ? 'text-rose-700'
                              : 'text-emerald-700'                          }`}
                        >
                          <span className="text-[10px]">●</span>
                          <span>
                            {u.status === UserStatus.DEACTIVATED
                              ? tr('Deactivated', 'Désactivé')
                              : tr('Active', 'Actif')}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {u.mustChangePassword && !isSelf && !isPreviewMode && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={resendingUid === u.uid}
                              onClick={() => handleResendWelcomeEmail(u)}
                              title={tr(
                                'Issue a new temporary password and e-mail it to this member again.',
                                'Générer un nouveau mot de passe temporaire et le renvoyer par e-mail à ce membre.'
                              )}
                            >
                              <MailCheck
                                className={`w-3.5 h-3.5 ${
                                  resendingUid === u.uid ? 'animate-pulse text-slate-400' : 'text-teal-600'
                                }`}
                              />
                              <span className="ml-1.5">
                                {resendingUid === u.uid
                                  ? tr('Sending…', 'Envoi…')
                                  : tr('Resend invite', "Renvoyer l'invitation")}
                              </span>
                            </Button>
                          )}
                          {!isSelf && !isPreviewMode && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={repairingUid === u.uid}
                              onClick={() => handleRepairAccess(u)}
                              aria-label={tr('Repair sign-in access', "Réparer l'accès")}
                              title={tr(
                                'Repair sign-in access for an account that can read the inventory but cannot record stock movements.',
                                "Réparer l'accès d'un compte qui peut consulter l'inventaire mais pas enregistrer de mouvements."
                              )}
                            >
                              <ShieldCheck
                                className={`w-3.5 h-3.5 ${
                                  repairingUid === u.uid
                                    ? 'animate-pulse text-slate-400'
                                    : 'text-emerald-600'
                                }`}
                              />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isSelf}
                            onClick={() => handleToggleUserStatus(u)}
                          >
                            {u.status === UserStatus.DEACTIVATED
                              ? tr('Activate', 'Activer')
                              : tr('Deactivate', 'Désactiver')}
                          </Button>
                          <Button
                            size="sm"
                            variant="tertiary"
                            disabled={isSelf}
                            onClick={() => handleRemoveMemberProfile(u)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">{tr('Chemical Name', 'Nom chimique')}</th>
                  <th className="py-2.5 px-4">{tr('CAS / Formula', 'CAS / Formule')}</th>
                  <th className="py-2.5 px-4">{tr('GHS Hazards', 'Dangers SGH')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Total Stock', 'Stock total')}</th>
                  <th className="py-2.5 px-4 text-right">{tr('Min / Reorder', 'Min / Réappro.')}</th>
                  <th className="py-2.5 px-4 text-right">SDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const totalStock = productAggregateStock.get(p.productId) || 0;
                  return (
                    <tr key={p.productId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {p.chemicalName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {p.casNumber} · {p.formula} ({p.molecularWeight} g/mol)
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-rose-700">
                        {p.hazardClass.join(' · ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {totalStock} {p.defaultUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                        {p.minimumStock} / {p.reorderLevel} {p.defaultUnit}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={p.sdsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1B8A2A] hover:underline inline-flex items-center gap-1 font-mono"
                        >
                          <span>FDS</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {tr('Create New User Profile', 'Créer un profil utilisateur')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateMemberProfile} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Full Name *', 'Nom complet *')}
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Dr. Meriem Khelifi"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Email *', 'E-mail *')}
                </label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="m.khelifi@lcsco.dz"
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  {tr('Role *', 'Rôle *')}
                </label>
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white"
                >
                  {LCSCO_FOUR_ACCOUNT_ROLES.map((roleOpt) => (
                    <option key={roleOpt} value={roleOpt}>
                      {formatRoleLabel(roleOpt, language)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <p className="text-[11px] text-slate-600">
                  {tr(
                    'The server creates the full account automatically and emails a welcome message with a temporary password. On first login the member will be required to choose their own personal password.',
                    'Le serveur crée automatiquement le compte complet et envoie un e-mail de bienvenue contenant un mot de passe temporaire. À sa première connexion, le membre devra choisir son propre mot de passe personnel.'
                  )}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddUserModal(false)}
                >
                  {tr('Cancel', 'Annuler')}
                </Button>
                <Button type="submit" variant="primary">
                  {isPreviewMode
                    ? tr('Create Profile', 'Créer le profil')
                    : tr('Create Account & Email Credentials', "Créer le compte et envoyer l'e-mail")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-TIME CREDENTIALS MODAL — shown after provisioning succeeds */}
      {provisionedAccount && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-md max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {credentialsReason === 'resent'
                  ? tr('Invitation Re-sent', 'Invitation renvoyée')
                  : tr('Account Created', 'Compte créé')}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setProvisionedAccount(null);
                  setCredentialsReason('created');
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {credentialsReason === 'resent' && (
              <p className="text-[11px] text-slate-600">
                {tr(
                  'A new temporary password was issued for this member — the previous one no longer works. They must still choose a personal password on first login.',
                  "Un nouveau mot de passe temporaire a été généré pour ce membre — l'ancien ne fonctionne plus. Il devra toujours choisir un mot de passe personnel à sa première connexion."
                )}
              </p>
            )}
            <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
              <MailCheck className="w-4 h-4 text-emerald-600 mt-0.5" />
              <p className="text-[11px] text-emerald-900">
                {provisionedAccount.emailSent
                  ? provisionedAccount.emailMode === 'setup-link'
                    ? tr(
                        `An invitation was emailed to ${provisionedAccount.email} by Firebase. It contains a link the member uses to choose a personal password.`,
                        `Une invitation a été envoyée à ${provisionedAccount.email} par Firebase. Elle contient un lien permettant au membre de choisir un mot de passe personnel.`
                      )
                    : tr(
                        `A welcome email was delivered to ${provisionedAccount.email} with their username and temporary password.`,
                        `Un e-mail de bienvenue a été envoyé à ${provisionedAccount.email} avec son identifiant et son mot de passe temporaire.`
                      )
                  : tr(
                      'The welcome email could not be delivered — copy the temporary password below and send it to the member yourself. They will replace it on first login.',
                      "L'e-mail de bienvenue n'a pas pu être envoyé — copiez le mot de passe temporaire ci-dessous et transmettez-le au membre. Il sera remplacé à la première connexion."
                    )}
                {!provisionedAccount.emailSent && provisionedAccount.emailError ? (
                  <span className="block mt-1 font-mono break-all opacity-80">
                    {provisionedAccount.emailError}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-0.5">
                  {tr('Username (email)', "Identifiant (e-mail)")}
                </p>
                <p className="font-mono text-slate-900 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                  {provisionedAccount.email}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-0.5">
                  {tr('Temporary password', 'Mot de passe temporaire')}
                </p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-mono text-slate-900 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md break-all">
                    {provisionedAccount.tempPassword}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(provisionedAccount.tempPassword);
                        setCopiedTempPassword(true);
                        window.setTimeout(() => setCopiedTempPassword(false), 2000);
                      } catch {
                        // Clipboard unavailable (permissions) — the value stays visible.
                      }
                    }}
                  >
                    {copiedTempPassword ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-[11px] text-amber-900">
                {tr(
                  'This password is shown only once and is never stored. The member must change it at their first login.',
                  "Ce mot de passe n'est affiché qu'une seule fois et n'est jamais stocké. Le membre devra le changer à sa première connexion."
                )}
              </p>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                onClick={() => {
                  setProvisionedAccount(null);
                  setCredentialsReason('created');
                }}
              >
                {tr('Done', 'Terminé')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
