import React, { useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Mail,
} from 'lucide-react';
import { useInventoryContext } from '../context/AuthContext';
import {
  LanguageSwitchButton,
  useLanguage,
} from '../context/LanguageContext';
import { LCSCOLogo } from './LCSCOLogo';

/**
 * Sign-in page.
 *
 * Authentication is delegated entirely to Firebase Auth email/password
 * accounts. Google sign-in was removed by design: every account is created by
 * the Laboratory Director or Secretary (who receives/forwards credentials via the
 * welcome-email flow), so nobody can appear unprovisioned.
 *
 * There is no local, plaintext credential comparison, and no anonymous
 * sign-in. Roles are granted by an administrator, never chosen at login.
 */
export const AuthenticationPage: React.FC = () => {
  const {
    signInWithEmailAndPasswordFlow,
    error,
    clearError,
  } = useInventoryContext();

  const { tr } = useLanguage();

  const [email, setEmail] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [localAuthError, setLocalAuthError] = useState<string | null>(null);

  const displayedError = localAuthError || error;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalAuthError(null);
    clearError();

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = passwordInput;

    if (!cleanEmail || !cleanPassword) {
      setLocalAuthError(
        tr(
          'Enter both your email address and password.',
          'Saisissez votre adresse e-mail et votre mot de passe.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPasswordFlow(cleanEmail, cleanPassword);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setLocalAuthError(
          tr(
            'Invalid email or password for this LCSCO account.',
            'E-mail ou mot de passe invalide pour ce compte LCSCO.'
          )
        );
      } else if (code === 'auth/user-disabled') {
        setLocalAuthError(
          tr(
            'This account has been deactivated. Please contact the Laboratory Director or Secretary.',
            'Ce compte a été désactivé. Contactez le Directeur ou le Secrétaire du laboratoire.'
          )
        );
      } else if (code === 'auth/operation-not-allowed') {
        setLocalAuthError(
          tr(
            'Email/Password sign-in is not enabled in Firebase (Authentication > Sign-in method).',
            'La connexion par e-mail/mot de passe n’est pas activée dans Firebase (Authentication > Sign-in method).'
          )
        );
      } else if (code === 'auth/unauthorized-domain') {
        setLocalAuthError(
          tr(
            'This domain is not yet registered in Firebase (Authentication > Settings > Authorized Domains).',
            'Ce domaine n’est pas enregistré dans Firebase (Authentication > Settings > Authorized Domains).'
          )
        );
      } else {
        setLocalAuthError(
          tr(
            'Sign-in failed. Please try again.',
            'Échec de la connexion. Veuillez réessayer.'
          )
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Top Language Switcher */}
        <div className="flex justify-end">
          <LanguageSwitchButton />
        </div>

        {/* Clean LCSCO Institutional Logo & Header */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <LCSCOLogo size="lg" />
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {tr('LCSCO Inventory', 'LCSCO Inventaire')}
            </h1>
            <p className="text-xs font-medium text-[#1E3A8A]">
              Laboratoire de Catalyse et Synthèse en Chimie Organique
            </p>
          </div>
        </div>

        {/* Clean Standard Login Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-6 sm:p-8 space-y-5">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {tr('Sign In', 'Connexion')}
              </h2>
              <p className="text-xs text-slate-500">
                {tr(
                  'Use your laboratory account to access the inventory',
                  'Utilisez votre compte de laboratoire pour accéder à l’inventaire'
                )}
              </p>
            </div>
            <span className="font-mono text-[11px] font-semibold text-[#1B8A2A] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
              {tr('LCSCO Lab', 'Labo LCSCO')}
            </span>
          </div>

          {displayedError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {tr('Email *', 'E-mail *')}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={tr('you@lcsco.dz', 'vous@lcsco.dz')}
                  className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {tr('Password *', 'Mot de passe *')}
              </label>
              <div className="relative">
                <LockIcon />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2.5 font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:border-[#1B8A2A]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#1B8A2A] rounded-md hover:bg-emerald-800 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{tr('Sign In to LCSCO Inventory', 'Se connecter à LCSCO Inventaire')}</span>
            </button>
          </form>

          <div className="relative py-1 flex items-center justify-center">
            <span className="absolute inset-x-0 top-1/2 h-px bg-slate-200" />
            <span className="relative bg-white px-3 text-[10px] font-mono font-semibold text-slate-400">
              {tr('Laboratory accounts only', 'Comptes du laboratoire uniquement')}
            </span>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            {tr(
              'Accounts are created by the Laboratory Director or Secretary. Ask them to add you from the Users administration screen — a welcome email with your temporary password will be sent to you.',
              "Les comptes sont créés par le Directeur ou le Secrétaire du laboratoire. Demandez-leur de vous ajouter depuis l'écran d'administration des Utilisateurs — un e-mail de bienvenue avec votre mot de passe temporaire vous sera envoyé."
            )}
          </p>
        </div>

        <p className="text-center text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
          {tr(
            'Accounts are provisioned by the Laboratory Director or Secretary. If you cannot access the inventory, make sure your account is active and your email is verified.',
            'Les comptes sont provisionnés par le Directeur ou le Secrétaire du laboratoire. Si vous ne pouvez pas accéder à l’inventaire, vérifiez que votre compte est actif et votre e-mail vérifié.'
          )}
        </p>
      </div>
    </div>
  );
};

const LockIcon = () => (
  <svg
    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
