import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { parseDisplayError } from '../firebase';

/**
 * First-login onboarding gate. When the Director provisions a lab member, the
 * account starts with a server-generated temporary password and the profile
 * carries a server-managed `mustChangePassword` flag. While that flag is set,
 * the user cannot enter the application: they must set a personal password
 * (Firebase Auth `updatePassword`) which then clears the flag through
 * POST /api/admin/complete-password-change.
 */
export const FirstLoginPasswordGate: React.FC = () => {
  const { changeOwnTemporaryPassword, signOut } = useInventoryContext();
  const { tr } = useLanguage();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = confirmPassword.length === 0 || newPassword === confirmPassword;
  const canSubmit = newPassword.length >= 8 && newPassword === confirmPassword && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await changeOwnTemporaryPassword(newPassword);
      // The profile listener releases this gate once mustChangePassword is cleared.
    } catch (err) {
      setError(parseDisplayError(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-sm p-8 space-y-5">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-slate-900">
            {tr('Welcome to LCSCO Inventory', 'Bienvenue sur LCSCO Inventaire')}
          </h1>
          <p className="text-xs text-slate-500">
            {tr(
              'Your account was created with a temporary password sent by email. For security, choose your own personal password now — the temporary one stops working as soon as you do.',
              'Votre compte a été créé avec un mot de passe temporaire envoyé par e-mail. Pour la sécurité, choisissez maintenant votre propre mot de passe personnel — le temporaire cessera de fonctionner dès la modification.'
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {tr('New password', 'Nouveau mot de passe')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                placeholder={tr('At least 8 characters', 'Au moins 8 caractères')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {tr('Confirm new password', 'Confirmer le nouveau mot de passe')}
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              className={`w-full text-sm border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 ${
                passwordsMatch ? 'border-slate-300' : 'border-red-400 bg-red-50/40'
              }`}
              placeholder={tr('Type it again', 'Saisissez-le à nouveau')}
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="mt-1 text-[11px] text-red-600">
                {tr('Passwords do not match.', 'Les mots de passe ne correspondent pas.')}
              </p>
            )}
          </div>

          {error && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-2.5 text-sm font-semibold rounded-md transition-colors ${
              canSubmit
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {submitting
              ? tr('Saving...', 'Enregistrement...')
              : tr('Set my password and continue', 'Définir le mot de passe et continuer')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full text-center text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          {tr('Sign out instead', 'Se déconnecter')}
        </button>
      </div>
    </div>
  );
};
