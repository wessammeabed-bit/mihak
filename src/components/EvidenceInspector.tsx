import React from 'react';
import { Claim } from '../types';
import { StatusBadge } from './StatusBadge';
import { 
  FileText, 
  Target, 
  BookOpen, 
  ArrowDown, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Hash, 
  Layers, 
  Compass,
  Sparkles
} from 'lucide-react';

interface EvidenceInspectorProps {
  fullDocumentText: string;
  selectedClaim: Claim;
  allClaims?: Claim[];
  onSelectClaim?: (claim: Claim) => void;
}

export const EvidenceInspector: React.FC<EvidenceInspectorProps> = ({
  fullDocumentText,
  selectedClaim,
  allClaims = [],
  onSelectClaim
}) => {
  const spanText = selectedClaim.source_span.text;

  // Render original document with the relevant sentence highlighted
  const renderHighlightedDocument = () => {
    if (!spanText || !fullDocumentText.includes(spanText)) {
      return (
        <p className="text-slate-300 leading-relaxed text-sm font-sans">
          {fullDocumentText}
        </p>
      );
    }

    const parts = fullDocumentText.split(spanText);
    return (
      <p className="text-slate-300 leading-relaxed text-sm font-sans">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part}
            {i < parts.length - 1 && (
              <mark className="bg-[#2EF2C2]/20 text-[#2EF2C2] px-2 py-0.5 rounded border border-[#2EF2C2]/40 font-semibold shadow-[0_0_12px_rgba(46,242,194,0.25)] mx-1">
                {spanText}
              </mark>
            )}
          </React.Fragment>
        ))}
      </p>
    );
  };

  return (
    <div className="bg-[#0B0F28]/95 border-2 border-[#263168] rounded-2xl p-6 sm:p-8 shadow-[0_10px_35px_rgba(0,0,0,0.5)] relative overflow-hidden backdrop-blur-xl">
      {/* Decorative ambient aura */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#2EF2C2]/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-[#6150EA]/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-[#263168]/80 gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-[#2EF2C2]/10 border border-[#2EF2C2]/30 text-[#2EF2C2]">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-white font-serif">
              فاحص الأدلة الثلاثي المرتبط
            </h3>
            <span className="text-xs font-mono text-[#D4AF37] px-2.5 py-0.5 rounded bg-[#D4AF37]/10 border border-[#D4AF37]/30">
              Evidence Inspector
            </span>
          </div>
          <p className="text-xs text-slate-400">
            تتبّع حي مباشر ثلاثي الطبقات: من النص الأصلي إلى الادعاء المستخرج، وصولاً إلى مستند الدليل المعتمد.
          </p>
        </div>

        {/* Claim Quick Switcher */}
        {allClaims.length > 1 && onSelectClaim && (
          <div className="flex items-center gap-1.5 bg-[#12183F] p-1.5 rounded-xl border border-[#263168]">
            <span className="text-[11px] text-slate-400 px-2 font-mono">الادعاءات:</span>
            {allClaims.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectClaim(c)}
                className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all ${
                  c.id === selectedClaim.id
                    ? 'bg-[#2EF2C2] text-[#0B0F28] font-bold shadow-[0_0_10px_rgba(46,242,194,0.4)]'
                    : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {c.id}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3 Linked Layers (As shown in Presentation Slide 7) */}
      <div className="mt-8 space-y-6 relative z-10">

        {/* 01: CONTENT LAYER */}
        <div className="relative group">
          <div className="bg-[#12183F]/90 border border-[#263168] hover:border-[#2EF2C2]/50 rounded-xl p-5 transition-all shadow-md">
            <div className="flex items-center justify-between mb-3 border-b border-[#263168]/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#263168] text-[#2EF2C2] text-xs font-mono font-bold flex items-center justify-center">
                  01
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  المحتوى الأصلي
                </span>
                <span className="text-[11px] text-slate-400 font-mono">Original Content</span>
              </div>
              <span className="text-[11px] text-[#2EF2C2] bg-[#2EF2C2]/10 px-2.5 py-0.5 rounded border border-[#2EF2C2]/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                تمييز الجملة محل الفحص
              </span>
            </div>

            <div className="bg-[#090D24] p-4 rounded-lg border border-[#1A2254]">
              {renderHighlightedDocument()}
            </div>
          </div>

          {/* Connector wire */}
          <div className="flex justify-center -my-2.5 relative z-20 pointer-events-none">
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-6 bg-gradient-to-b from-[#2EF2C2] to-[#D4AF37]"></div>
              <div className="w-6 h-6 rounded-full bg-[#12183F] border-2 border-[#2EF2C2] flex items-center justify-center shadow-[0_0_10px_rgba(46,242,194,0.4)]">
                <ArrowDown className="w-3.5 h-3.5 text-[#2EF2C2]" />
              </div>
            </div>
          </div>
        </div>

        {/* 02: CLAIM LAYER */}
        <div className="relative group">
          <div className="bg-[#12183F]/90 border border-[#D4AF37]/50 rounded-xl p-5 transition-all shadow-md">
            <div className="flex items-center justify-between mb-3 border-b border-[#263168]/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#D4AF37]/20 text-[#D4AF37] text-xs font-mono font-bold flex items-center justify-center">
                  02
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  الادعاء المستخرج
                </span>
                <span className="text-[11px] text-[#D4AF37] font-mono font-bold">
                  [{selectedClaim.id}]
                </span>
              </div>
              <StatusBadge status={selectedClaim.status} size="sm" />
            </div>

            <div className="bg-[#090D24] p-4 rounded-lg border border-[#D4AF37]/30">
              <div className="text-base text-white font-medium font-serif leading-relaxed">
                {selectedClaim.claim_text}
              </div>

              {selectedClaim.verification_rationale && (
                <div className="mt-3 pt-3 border-t border-[#1C2552] text-xs text-slate-300 flex items-start gap-2">
                  <Compass className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <span>{selectedClaim.verification_rationale}</span>
                </div>
              )}

              {selectedClaim.specialist_review_reason && (
                <div className="mt-2 text-xs text-indigo-300 bg-indigo-950/40 p-2.5 rounded border border-indigo-500/30 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>تنبيه التخصص: {selectedClaim.specialist_review_reason}</span>
                </div>
              )}
            </div>
          </div>

          {/* Connector wire */}
          <div className="flex justify-center -my-2.5 relative z-20 pointer-events-none">
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-6 bg-gradient-to-b from-[#D4AF37] to-[#2EF2C2]"></div>
              <div className="w-6 h-6 rounded-full bg-[#12183F] border-2 border-[#2EF2C2] flex items-center justify-center shadow-[0_0_10px_rgba(46,242,194,0.4)]">
                <ArrowDown className="w-3.5 h-3.5 text-[#2EF2C2]" />
              </div>
            </div>
          </div>
        </div>

        {/* 03: EVIDENCE LAYER */}
        <div className="relative group">
          <div className="bg-[#12183F]/90 border border-[#2EF2C2]/60 rounded-xl p-5 transition-all shadow-md">
            <div className="flex items-center justify-between mb-4 border-b border-[#263168]/60 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#2EF2C2]/20 text-[#2EF2C2] text-xs font-mono font-bold flex items-center justify-center">
                  03
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                  الدليل المعتمد والمرجع
                </span>
                <span className="text-[11px] text-slate-400 font-mono">Ground Truth & Canonical Corpus</span>
              </div>
              <span className="text-xs font-mono text-[#2EF2C2] flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                {selectedClaim.evidence ? 'موثّق في المدونة' : 'لم يُعثر على دليل كافٍ'}
              </span>
            </div>

            {selectedClaim.evidence ? (
              <div className="space-y-4">
                {/* 4 Metadata Cards matching Slide 7 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  
                  {/* Source */}
                  <div className="bg-[#090D24] p-3.5 rounded-lg border border-[#263168]">
                    <div className="text-[10px] text-slate-400 font-mono mb-1">المصدر (Source)</div>
                    <div className="text-sm font-bold text-white font-serif flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-[#2EF2C2]" />
                      {selectedClaim.evidence.source_name}
                    </div>
                  </div>

                  {/* Reference */}
                  <div className="bg-[#090D24] p-3.5 rounded-lg border border-[#263168]">
                    <div className="text-[10px] text-slate-400 font-mono mb-1">المرجع (Reference)</div>
                    <div className="text-sm font-semibold text-[#D4AF37]">
                      {selectedClaim.evidence.canonical_reference}
                    </div>
                  </div>

                  {/* Passage snippet */}
                  <div className="bg-[#090D24] p-3.5 rounded-lg border border-[#263168]">
                    <div className="text-[10px] text-slate-400 font-mono mb-1">موضع الدليل (Passage)</div>
                    <div className="text-sm font-serif text-[#2EF2C2] truncate">
                      «{selectedClaim.evidence_passage || selectedClaim.evidence.raw_text}»
                    </div>
                  </div>

                  {/* Relation */}
                  <div className="bg-[#090D24] p-3.5 rounded-lg border border-[#263168]">
                    <div className="text-[10px] text-slate-400 font-mono mb-1">علاقة الدليل بالادعاء (Relation)</div>
                    <div className="text-xs font-medium text-emerald-300">
                      {selectedClaim.evidence_relation === 'DIRECT_SUPPORT'
                        ? 'يدعم النص الادعاء مباشرة'
                        : selectedClaim.evidence_relation === 'PARTIAL_SUPPORT'
                        ? 'يدعم جزءاً فقط من الادعاء'
                        : 'تحتاج لفحص متخصص'}
                    </div>
                  </div>

                </div>

                {/* Supporting Text Full Box */}
                <div className="bg-[#090D24] p-5 rounded-lg border border-[#2EF2C2]/40 relative overflow-hidden">
                  <div className="text-[11px] font-mono text-slate-400 mb-2 flex items-center justify-between">
                    <span>النص الداعم الدقيق في المصحف الشريف:</span>
                    <span className="text-[#2EF2C2] text-xs">رواية حفص عن عاصم</span>
                  </div>
                  
                  <div className="text-xl sm:text-2xl text-center py-4 text-emerald-100 font-serif leading-loose tracking-wide bg-gradient-to-r from-transparent via-[#2EF2C2]/5 to-transparent rounded">
                    ﴿ {selectedClaim.evidence.raw_text} ﴾
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#1C2552] flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] text-slate-400 gap-2">
                    <div>
                      <span className="text-slate-400">الإصدار والنسخة: </span>
                      <span className="text-slate-300">{selectedClaim.evidence.version}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">ملاحظة التوثيق: </span>
                      <span className="text-slate-300">{selectedClaim.evidence.license_note}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#090D24] p-6 rounded-lg border border-orange-500/30 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 text-orange-400 mx-auto flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-semibold text-orange-300">
                  امتناع منهجي: لا يتوفر دليل كافٍ في المدونة المعتمدة
                </h4>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  تلتزم خوارزميات «مِحَكّ» بعدم اختلاق مصادر أو استخدام ذاكرة النموذج اللغوي كدليل شرعي. عند غياب الدليل القطعي، يمتنع النظام صراحة عن إثبات الادعاء.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
