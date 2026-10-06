import React from 'react';
import { Claim } from '../types';
import { StatusBadge } from './StatusBadge';
import { ArrowLeft, BookOpen, ShieldAlert } from 'lucide-react';

interface ClaimCardProps {
  claim: Claim;
  isSelected: boolean;
  onSelect: () => void;
}

export const ClaimCard: React.FC<ClaimCardProps> = ({ claim, isSelected, onSelect }) => {
  return (
    <div
      onClick={onSelect}
      className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative group ${
        isSelected
          ? 'bg-[#112240] border-[#D4A64A] shadow-[0_0_20px_rgba(212,166,74,0.2)]'
          : 'bg-[#0B1730]/90 border-[#162D52] hover:border-[#D4A64A]/40 hover:bg-[#112240]/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-[#D4A64A] px-2 py-0.5 rounded bg-[#D4A64A]/10 border border-[#D4A64A]/20">
            {claim.id}
          </span>
          {claim.exactMatch ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#2EF2C2]/10 border border-[#2EF2C2]/30 text-[#2EF2C2]">
              مطابقة مباشرة
            </span>
          ) : typeof claim.evidenceCoverage === 'number' ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-400/10 border border-sky-400/30 text-sky-300">
              اكتمال التحقق: {Math.round(claim.evidenceCoverage * 100)}%
            </span>
          ) : (claim.status === 'SUPPORTED' || claim.status === 'VERIFIED_QUOTE') && typeof claim.retrievalSimilarity === 'number' && claim.retrievalSimilarity > 0 ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
             درجة مطابقة الادعاء للدليل: {Math.round(claim.retrievalSimilarity * 100)}%
            </span>
          ) : null}
        </div>
        <StatusBadge status={claim.status} size="sm" />
      </div>

      <p className="text-sm font-medium text-white mb-3 line-clamp-2 leading-relaxed font-serif">
        {claim.claim_text}
      </p>

      {/* Footer metadata */}
      <div className="flex items-center justify-between text-xs text-[#94A3B8] pt-2.5 border-t border-[#162D52]">
        <div className="flex items-center gap-1.5 truncate max-w-[280px]">
          {claim.evidence ? (
            <span className="text-emerald-400 flex items-center gap-1 truncate">
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              {claim.evidence.source_name} — {claim.evidence.canonical_reference}
            </span>
          ) : claim.specialist_review_reason ? (
            <span className="text-indigo-300 flex items-center gap-1 truncate">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              إحالة لمتخصص
            </span>
          ) : (
            <span className="text-orange-400/90 truncate">
              امتناع: لا يوجد دليل مسند
            </span>
          )}
        </div>

        <span className={`text-[11px] font-medium flex items-center gap-1 group-hover:translate-x-[-2px] transition-transform ${
          isSelected ? 'text-[#D4A64A]' : 'text-[#94A3B8]'
        }`}>
          <span>فحص</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
};
