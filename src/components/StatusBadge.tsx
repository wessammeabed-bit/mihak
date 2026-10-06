import React from 'react';
import { ClaimStatus, SemanticDeltaCategory } from '../types';
import { CheckCircle2, AlertCircle, AlertTriangle, HelpCircle, GitFork } from 'lucide-react';

interface StatusBadgeProps {
  status: ClaimStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', showIcon = true }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'VERIFIED_QUOTE':
        return {
          label: 'اقتباس موثّق',
          subLabel: 'VERIFIED QUOTE',
          bg: 'bg-[#2EF2C2]/10',
          border: 'border-[#2EF2C2]/40',
          text: 'text-[#2EF2C2]',
          glow: 'shadow-[0_0_12px_rgba(46,242,194,0.25)]',
          icon: CheckCircle2,
        };
      case 'SUPPORTED':
        return {
          label: 'مدعوم بدليل',
          subLabel: 'SUPPORTED',
          bg: 'bg-[#2EF2C2]/10',
          border: 'border-[#2EF2C2]/40',
          text: 'text-[#2EF2C2]',
          glow: 'shadow-[0_0_12px_rgba(46,242,194,0.25)]',
          icon: CheckCircle2,
        };
      case 'PARTIALLY_SUPPORTED':
        return {
          label: 'مدعوم جزئيًا',
          subLabel: 'PARTIALLY SUPPORTED',
          bg: 'bg-[#E5C06E]/10',
          border: 'border-[#E5C06E]/40',
          text: 'text-[#E5C06E]',
          glow: 'shadow-[0_0_12px_rgba(229,192,110,0.25)]',
          icon: AlertCircle,
        };
      case 'TRANSFORMATION_DRIFT':
        return {
          label: 'انزياح دلالي',
          subLabel: 'TRANSFORMATION DRIFT',
          bg: 'bg-purple-500/10',
          border: 'border-purple-500/40',
          text: 'text-purple-300',
          glow: 'shadow-[0_0_12px_rgba(168,85,247,0.25)]',
          icon: AlertCircle,
        };
      case 'INSUFFICIENT_EVIDENCE':
        return {
          label: 'الأدلة غير كافية',
          subLabel: 'INSUFFICIENT EVIDENCE',
          bg: 'bg-[#F97316]/10',
          border: 'border-[#F97316]/40',
          text: 'text-[#F97316]',
          glow: 'shadow-[0_0_12px_rgba(249,115,22,0.25)]',
          icon: AlertTriangle,
        };
      case 'NEEDS_SPECIALIST_REVIEW':
        return {
          label: 'يحتاج مراجعة متخصصة',
          subLabel: 'NEEDS SPECIALIST REVIEW',
          bg: 'bg-[#818CF8]/10',
          border: 'border-[#818CF8]/40',
          text: 'text-[#818CF8]',
          glow: 'shadow-[0_0_12px_rgba(129,140,248,0.25)]',
          icon: HelpCircle,
        };
      case 'SOURCE_COVERAGE_GAP':
        return {
          label: 'فجوة في تغطية المصادر',
          subLabel: 'SOURCE COVERAGE GAP',
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/40',
          text: 'text-rose-300',
          glow: 'shadow-[0_0_12px_rgba(244,63,94,0.25)]',
          icon: AlertCircle,
        };
      default:
        return {
          label: status,
          subLabel: '',
          bg: 'bg-slate-800',
          border: 'border-slate-700',
          text: 'text-slate-300',
          glow: '',
          icon: HelpCircle,
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-xs px-3 py-1.5 gap-2',
    lg: 'text-sm px-4 py-2 gap-2.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium rounded-md border ${config.bg} ${config.border} ${config.text} ${config.glow} ${sizeClasses}`}
      dir="rtl"
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'} />}
      <span>{config.label}</span>
      <span className="text-[10px] opacity-75 font-mono uppercase tracking-wider">{config.subLabel}</span>
    </span>
  );
};

export const SemanticDeltaBadge: React.FC<{ category: SemanticDeltaCategory }> = ({ category }) => {
  const getCategoryDetails = () => {
    switch (category) {
      case 'ADDITION':
        return { label: 'إضافة معنى', en: 'ADDITION', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' };
      case 'OMISSION':
        return { label: 'حذف معنى أو قيد', en: 'OMISSION', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      case 'NEGATION_SHIFT':
        return { label: 'تغيّر النفي والإثبات', en: 'NEGATION SHIFT', color: 'text-red-400 bg-red-500/10 border-red-500/30' };
      case 'MODALITY_SHIFT':
        return { label: 'تغيّر درجة اليقين', en: 'MODALITY SHIFT', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'SCOPE_SHIFT':
        return { label: 'توسيع/تضييق النطاق', en: 'SCOPE SHIFT', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' };
      case 'ATTRIBUTION_SHIFT':
        return { label: 'تغيّر جهة النسبة', en: 'ATTRIBUTION SHIFT', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' };
      case 'TERM_DRIFT':
        return { label: 'انزياح المصطلح', en: 'TERM DRIFT', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' };
      default:
        return { label: 'غير محسوم', en: 'UNRESOLVED', color: 'text-slate-400 bg-slate-500/10 border-slate-500/30' };
    }
  };

  const details = getCategoryDetails();

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border font-medium ${details.color}`}>
      <GitFork className="w-3.5 h-3.5" />
      <span>{details.label}</span>
      <span className="text-[9px] opacity-70 font-mono">{details.en}</span>
    </span>
  );
};
