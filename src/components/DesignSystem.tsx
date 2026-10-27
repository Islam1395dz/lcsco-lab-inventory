import React from 'react';
import { X } from 'lucide-react';
import { ContainerStatus, StockRuptureStatus } from '../types/inventory';
import { useLanguage } from '../context/LanguageContext';

/**
 * Design System Primitives for LCSCO Laboratory Inventory Management System
 * Principle: "Simple at first glance -> detailed when the user needs it."
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  ...props
}) => {
  const sizeClasses =
    size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs';

  const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary:
      'bg-[#1B8A2A] text-white font-semibold hover:bg-emerald-800 border border-transparent shadow-2xs',
    secondary:
      'bg-white text-slate-700 font-medium border border-slate-300 hover:bg-slate-50 hover:text-slate-900',
    tertiary:
      'bg-transparent text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-100 border border-transparent',
    ghost:
      'bg-transparent text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-100 border border-transparent',
    danger:
      'bg-rose-600 text-white font-semibold hover:bg-rose-700 border border-transparent',
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${sizeClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
};

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

export const Badge: React.FC<{
  variant?: 'neutral' | 'teal' | 'info' | 'warning' | 'danger' | 'success';
  children: React.ReactNode;
}> = ({ variant = 'neutral', children }) => {
  const styles: Record<string, string> = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    teal: 'bg-teal-50 text-teal-800 border-teal-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-800 border-rose-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-medium border ${
        styles[variant] || styles.neutral
      }`}
    >
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<{
  status:
    | ContainerStatus
    | StockRuptureStatus
    | 'PENDING'
    | 'REQUESTED'
    | 'APPROVED'
    | 'ORDERED'
    | 'RECEIVED'
    | 'DISPOSED'
    | 'REJECTED'
    | 'EXPIRING_SOON'
    | string;
  expiryDate?: string;
}> = ({ status, expiryDate }) => {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  let effectiveStatus = status;
  if (expiryDate && (status === ContainerStatus.NORMAL || status === ContainerStatus.LOW_STOCK)) {
    const now = new Date('2026-10-06T00:00:00Z');
    const exp = new Date(expiryDate);
    if (!isNaN(exp.getTime())) {
      if (exp < now) {
        effectiveStatus = ContainerStatus.EXPIRED;
      } else {
        const diffDays = (exp.getTime() - now.getTime()) / (1000 * 3600 * 24);
        if (diffDays <= 90 && status === ContainerStatus.NORMAL) {
          effectiveStatus = 'EXPIRING_SOON';
        }
      }
    }
  }

  switch (effectiveStatus) {
    case ContainerStatus.NORMAL:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <span className="text-[10px]" aria-hidden="true">●</span>
          <span>{isFr ? 'Normal' : 'Available'}</span>
        </span>
      );
    case ContainerStatus.LOW_STOCK:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <span className="text-[10px]" aria-hidden="true">▲</span>
          <span>{isFr ? 'Stock faible' : 'Low stock'}</span>
        </span>
      );
    case ContainerStatus.NEARLY_EMPTY:
    case StockRuptureStatus.REPORTED:
    case StockRuptureStatus.CONFIRMED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
          <span className="text-[10px]" aria-hidden="true">▼</span>
          <span>{isFr ? 'Rupture / Critique' : 'Rupture / Critical'}</span>
        </span>
      );
    case 'EXPIRING_SOON':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700">
          <span className="text-[10px]" aria-hidden="true">◆</span>
          <span>{isFr ? 'Expiration proche' : 'Expiring soon'}</span>
        </span>
      );
    case ContainerStatus.EXPIRED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700">
          <span className="text-[10px]" aria-hidden="true">!</span>
          <span>{isFr ? 'Expiré' : 'Expired'}</span>
        </span>
      );
    case 'PENDING':
    case 'REQUESTED':
    case StockRuptureStatus.UNDER_REVIEW:
    case ContainerStatus.NEEDS_IDENTIFICATION:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <span className="text-[10px]" aria-hidden="true">◐</span>
          <span>{isFr ? 'En attente' : 'Pending'}</span>
        </span>
      );
    case 'APPROVED':
    case 'ORDERED':
    case 'RECEIVED':
    case 'DISPOSED':
    case StockRuptureStatus.RESOLVED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <span className="text-[10px]" aria-hidden="true">✓</span>
          <span>
            {effectiveStatus === 'RECEIVED'
              ? isFr
                ? 'Reçu'
                : 'Received'
              : effectiveStatus === 'ORDERED'
              ? isFr
                ? 'Commandé'
                : 'Ordered'
              : effectiveStatus === 'DISPOSED'
              ? isFr
                ? 'Éliminé'
                : 'Disposed'
              : isFr
              ? 'Approuvé'
              : 'Approved'}
          </span>
        </span>
      );
    case 'REJECTED':
    case StockRuptureStatus.REJECTED:
    case ContainerStatus.QUARANTINED:
    case ContainerStatus.DISPOSAL_REQUIRED:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
          <span className="text-[10px]" aria-hidden="true">✕</span>
          <span>
            {effectiveStatus === ContainerStatus.QUARANTINED
              ? isFr
                ? 'Quarantaine'
                : 'Quarantined'
              : effectiveStatus === ContainerStatus.DISPOSAL_REQUIRED
              ? isFr
                ? 'À éliminer'
                : 'Disposal req.'
              : isFr
              ? 'Rejeté'
              : 'Rejected'}
          </span>
        </span>
      );
    default:
      return (
        <span className="text-xs text-slate-600">{String(effectiveStatus)}</span>
      );
  }
};

export const ContainerStatusBadge: React.FC<{
  status: ContainerStatus;
  isFr?: boolean;
}> = ({ status }) => {
  return <StatusBadge status={status} />;
};

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => {
  return (
    <div className="p-10 text-center flex flex-col items-center justify-center space-y-2.5">
      {icon && <div className="text-slate-400">{icon}</div>}
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {description && (
        <p className="text-xs text-slate-500 max-w-md">{description}</p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  footer?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-lg',
  footer,
  bodyClassName = '',
  children,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white border border-slate-200 rounded-xl w-full ${maxWidth} max-h-[90dvh] shadow-xl flex flex-col overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 sm:px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 ${bodyClassName}`}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 sm:px-6 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
