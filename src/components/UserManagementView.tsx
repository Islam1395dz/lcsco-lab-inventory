import React, { useState } from 'react';
import {
  ExternalLink,
  Lock,
  Plus,
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

      const generatedUid = `LCSCO-${Date.now().toString(36).toUpperCase()}`;
      let createdUid = generatedUid;

      // Credential management belongs to Firebase Authentication: the Director
      // provisions the profile; the user signs in with their own (resettable)
      // password or Google identity. No passwords transit through Firestore.
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
          `Added user ${newMemberName} (${formatRoleLabel(newMemberRole, language)}). They can sign in with their Google account, or with an email/password account you create for them in Firebase Console (Authentication > Users).`,
          `Utilisateur ${newMemberName} ajouté (${formatRoleLabel(newMemberRole, language)}). Il peut se connecter avec son compte Google, ou avec un compte e-mail/mot de passe que vous créez pour lui dans la console Firebase (Authentication > Users).`
        ),
      });
      setNewMemberName('');
      setNewMemberEmail('');
      setShowAddUserModal(false);
    } catch (err) {
      setFeedback({ type: 'error', message: parseDisplayError(err) });
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
                        <div>{u.fullName}</div>
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
                              : 'text-emerald-700'
                          }`}
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
                    'After creating the profile, add a Firebase Authentication account for this email (Authentication > Users > Add user), or ask them to sign in with Google. Their password is managed by Firebase and never stored in the inventory database.',
                    'Après la création du profil, ajoutez un compte Firebase Authentication pour cet e-mail (Authentication > Users > Add user), ou invitez-le à se connecter avec Google. Son mot de passe est géré par Firebase et n’est jamais stocké dans la base d’inventaire.'
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
                  {tr('Create Profile', 'Créer le profil')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
