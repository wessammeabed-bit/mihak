import React from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  Sparkles, 
  BookOpen, 
  Layers 
} from 'lucide-react';
import { Claim, AuditRun } from '../types';

interface ConfidenceScoreProps {
  auditRun?: AuditRun | null;
  claims?: Claim[];
  confidenceScore?: number;
  className?: string;
  variant?: 'card' | 'badge' | 'compact';
}

export function computeAuditCategoricalStats(claims: Claim[] = []): {
  totalCount: number;
  supportedCount: number;
  verifiedQuoteCount: number;
  partialCount: number;
  unverifiedCount: number;
  specialistCount: number;
  driftCount: number;
  coverageGapCount: number;
  coveragePercent?: number;
  hasExactMatch: boolean;
} {
  const totalCount = claims.length;
  const supportedCount = claims.filter(c => c.status === 'SUPPORTED').length;
  const verifiedQuoteCount = claims.filter(c => c.status === 'VERIFIED_QUOTE').length;
  const partialCount = claims.filter(c => c.status === 'PARTIALLY_SUPPORTED').length;
  const unverifiedCount = claims.filter(c => c.status === 'INSUFFICIENT_EVIDENCE').length;
  const specialistCount = claims.filter(c => c.status === 'NEEDS_SPECIALIST_REVIEW').length;
  const driftCount = claims.filter(c => c.status === 'TRANSFORMATION_DRIFT').length;
  const coverageGapCount = claims.filter(c => c.status === 'SOURCE_COVERAGE_GAP').length;
  const hasExactMatch = claims.some(c => c.exactMatch || c.status === 'VERIFIED_QUOTE');

  // If compound claim with explicit evidenceCoverage
  const compoundCoverage = claims.find(c => typeof c.evidenceCoverage === 'number')?.evidenceCoverage;
  const coveragePercent = typeof compoundCoverage === 'number'
    ? Math.round(compoundCoverage * 100)
    : (totalCount > 1 ? Math.round(((supportedCount + verifiedQuoteCount) / totalCount) * 100) : undefined);

  return {
    totalCount,
    supportedCount,
    verifiedQuoteCount,
    partialCount,
    unverifiedCount,
    specialistCount,
    driftCount,
    coverageGapCount,
    coveragePercent,
    hasExactMatch
  };
}

/**
 * Clean Badge displaying ONLY semantically valid, provenance-backed metrics:
 * - Exact Match: "مطابقة مباشرة بالمصدر"
 * - Evidence Coverage: "اكتمال التحقق: X%"
 * - Retrieval Similarity: "درجة التشابه: X%"
 * NEVER displays arbitrary "religious truth" percentages.
 */
export const ConfidenceScoreBadge: React.FC<{
  claim?: Claim;
  score?: number;
  size?: 'sm' | 'md';
}> = ({ claim, score, size = 'sm' }) => {
  // 1. Exact Match badge
  if (claim?.exactMatch || claim?.status === 'VERIFIED_QUOTE') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium text-[#2EF2C2] bg-[#2EF2C2]/10 border-[#2EF2C2]/30 ${
          size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
        }`}
        title="مطابقة نصية مباشرة ومحققة في المتن المعتمد"
      >
        <CheckCircle2 className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>مطابقة مباشرة بالمصدر</span>
      </div>
    );
  }

  // 2. Evidence coverage badge for compound claims
  if (typeof claim?.evidenceCoverage === 'number') {
    const pct = Math.round(claim.evidenceCoverage * 100);
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium text-sky-300 bg-sky-400/10 border-sky-400/30 ${
          size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
        }`}
        title="نسبة العناصر الأساسية في الادعاء التي تم التحقق منها في المصادر المتصلة"
      >
        <Layers className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>اكتمال التحقق: {pct}%</span>
      </div>
    );
  }

  // 3. Retrieval similarity badge if measured
  if (
    claim?.status === 'SUPPORTED' &&
    typeof claim?.retrievalSimilarity === 'number' &&
    claim.retrievalSimilarity > 0
  ) {
    const pct = Math.round(claim.retrievalSimilarity * 100);
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium text-slate-300 bg-white/5 border-white/10 ${
          size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
        }`}
        title="درجة مطابقة الادعاء للدليل"
      >
        <Sparkles className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>درجة مطابقة الادعاء للدليل: {pct}%</span>
      </div>
    );
  }

  // If an exact numeric score was explicitly passed (e.g. 1.0 for exact match)
  if (typeof score === 'number' && score >= 0.99) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-medium text-[#2EF2C2] bg-[#2EF2C2]/10 border-[#2EF2C2]/30 ${
          size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
        }`}
        title="مطابقة مباشرة بالمصدر"
      >
        <CheckCircle2 className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>مطابقة مباشرة بالمصدر</span>
      </div>
    );
  }

  // Return null if no valid metric exists (No arbitrary percentages!)
  return null;
};

/**
 * Honest, semantically grounded categorical summary card.
 * Replaces the old undefined circular percentage gauge with verifiable evidence metrics.
 */
export const ConfidenceScore: React.FC<ConfidenceScoreProps> = ({
  auditRun,
  claims = [],
  className = '',
  variant = 'card'
}) => {
  const targetClaims = claims.length > 0 ? claims : auditRun?.claims || [];
  const stats = React.useMemo(() => computeAuditCategoricalStats(targetClaims), [targetClaims]);

  if (variant === 'badge') {
    return <ConfidenceScoreBadge claim={targetClaims[0]} />;
  }

  return (
    <article
      className={`rounded-2xl border border-white/10 bg-[#0C1428] shadow-[0_0_35px_rgba(0,0,0,0.4)] p-5 sm:p-6 transition-all duration-300 ${className}`}
      dir="rtl"
    >
      <div className="flex flex-col gap-5">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#2EF2C2]/10 border border-[#2EF2C2]/20 text-[#2EF2C2]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                ملخص نتائج التحقق المستند للأدلة
              </h3>
              <p className="text-xs text-slate-400">
                تصنيف موضوعي لحالة كل ادعاء نسبةً إلى المتون القرآنية والحديثية والتفسيرية المتصلة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="font-mono text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
              إجمالي العناصر المدققة: <strong className="text-white font-bold">{stats.totalCount}</strong>
            </span>
            {stats.hasExactMatch && (
              <span className="inline-flex items-center gap-1 font-mono text-xs px-2.5 py-1 rounded-full bg-[#2EF2C2]/10 border border-[#2EF2C2]/30 text-[#2EF2C2]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                مطابقة مباشرة بالمصدر
              </span>
            )}
          </div>
        </div>

        {/* Categorical metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
          {/* 1. Verified quotes */}
          <div className="rounded-xl border border-[#2EF2C2]/30 bg-[#2EF2C2]/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">اقتباس موثّق</p>
            <p className="text-lg font-bold text-[#2EF2C2] mt-1 font-mono">
              {stats.verifiedQuoteCount}
            </p>
          </div>

          {/* 2. Supported */}
          <div className="rounded-xl border border-[#2EF2C2]/30 bg-[#2EF2C2]/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">مدعوم بالدليل</p>
            <p className="text-lg font-bold text-[#2EF2C2] mt-1 font-mono">
              {stats.supportedCount}
            </p>
          </div>

          {/* 3. Partially supported */}
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">مدعوم جزئيًا</p>
            <p className="text-lg font-bold text-amber-300 mt-1 font-mono">
              {stats.partialCount}
            </p>
          </div>

          {/* 4. Insufficient evidence */}
          <div className="rounded-xl border border-orange-400/30 bg-orange-400/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">الأدلة غير كافية</p>
            <p className="text-lg font-bold text-orange-300 mt-1 font-mono">
              {stats.unverifiedCount}
            </p>
          </div>

          {/* 5. Source coverage gap */}
          <div className="rounded-xl border border-rose-400/30 bg-rose-400/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">فجوة مصادر</p>
            <p className="text-lg font-bold text-rose-300 mt-1 font-mono">
              {stats.coverageGapCount}
            </p>
          </div>

          {/* 6. Needs specialist */}
          <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">يحتاج متخصصًا</p>
            <p className="text-lg font-bold text-indigo-300 mt-1 font-mono">
              {stats.specialistCount}
            </p>
          </div>

          {/* 7. Semantic drift */}
          <div className="rounded-xl border border-purple-400/30 bg-purple-400/[0.04] p-3 text-center">
            <p className="text-[11px] font-medium text-slate-400">انزياح دلالي</p>
            <p className="text-lg font-bold text-purple-300 mt-1 font-mono">
              {stats.driftCount}
            </p>
          </div>
        </div>

        {/* Evidence coverage row for compound claims */}
        {typeof stats.coveragePercent === 'number' && stats.totalCount > 1 && (
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.03] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-slate-300 font-medium">
                اكتمال التحقق من عناصر الادعاء:
              </span>
              <strong className="text-sky-300 font-mono text-sm">{stats.coveragePercent}%</strong>
              <span className="text-slate-400">
                ({stats.supportedCount + stats.verifiedQuoteCount} من أصل {stats.totalCount} عناصر مدعومة بمصادر معتمدة)
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              * يعبر عن نسبة العناصر المفحوصة نصيًا، ولا يمثل نسبة صحة دينية.
            </span>
          </div>
        )}

        {/* Methodological notice: NO religious truth probability */}
        <div className="pt-2 border-t border-white/[0.06] flex items-start gap-2 text-[11px] text-slate-400 leading-5">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <span>
            يقيم «مِحَكّ» درجة المطابقة والعلاقة مع المتون والأدلة الشرعية المسندة المتصلة بالمحرك، ويمتنع صراحةً عن حساب أي احتمالات أو نسب صحة غيبية أو أحكام شرعية مستحدثة.
          </span>
        </div>
      </div>
    </article>
  );
};
