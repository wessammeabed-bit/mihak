import React from 'react';
import { TransformationDelta } from '../types';
import { SemanticDeltaBadge } from './StatusBadge';
import { 
  GitCompare, 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle, 
  Layers, 
  Sparkles, 
  ShieldAlert,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';

interface SemanticDiffGraphProps {
  sourceText: string;
  derivedText: string;
  derivedType: string;
  deltas: TransformationDelta[];
  integrityScore: number;
  alignmentSummary: string;
}

export const SemanticDiffGraph: React.FC<SemanticDiffGraphProps> = ({
  sourceText,
  derivedText,
  derivedType,
  deltas,
  integrityScore,
  alignmentSummary
}) => {
  const [selectedDeltaId, setSelectedDeltaId] = React.useState<string | null>(
    deltas.length > 0 ? deltas[0].id : null
  );

  const activeDelta = deltas.find(d => d.id === selectedDeltaId) || deltas[0];

  return (
    <div className="bg-[#0B0F28]/95 border-2 border-[#263168] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
      {/* Decorative background glow */}
      <div className="absolute top-0 right-1/3 w-80 h-80 bg-[#6150EA]/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header bar with Integrity Score */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-[#263168]/80 gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 rounded-lg bg-[#6150EA]/20 border border-[#6150EA]/40 text-[#A855F7]">
              <GitCompare className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-white font-serif">
              فاحص الفارق الدلالي المرتبط بالمصدر
            </h3>
            <span className="text-xs font-mono text-[#D4AF37] px-2.5 py-0.5 rounded bg-[#D4AF37]/10 border border-[#D4AF37]/30">
              Source-Bound Semantic Diff
            </span>
          </div>
          <p className="text-xs text-slate-400">
            «ما الذي يدعمه المصدر فعليًا، وما الذي تغيّر أثناء النقل أو الترجمة أو التلخيص؟»
          </p>
        </div>

        {/* Integrity score indicator */}
        <div className="flex items-center gap-4 bg-[#12183F] p-3 rounded-xl border border-[#263168] shrink-0">
          <div className="text-right">
            <div className="text-[11px] text-slate-400 font-mono">مؤشر سلامة النقل</div>
            <div className="text-xs text-slate-300">Semantic Integrity</div>
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-lg font-bold font-mono border ${
            integrityScore >= 80 
              ? 'bg-[#2EF2C2]/10 border-[#2EF2C2]/40 text-[#2EF2C2]' 
              : integrityScore >= 50
              ? 'bg-[#E5C06E]/10 border-[#E5C06E]/40 text-[#E5C06E]'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
          }`}>
            {integrityScore}%
          </div>
        </div>
      </div>

      {/* Alignment summary note */}
      <div className="mt-5 p-4 rounded-xl bg-[#12183F]/80 border border-[#263168] text-xs sm:text-sm text-slate-200 leading-relaxed flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white ml-1">خلاصة فحص النقل ({derivedType}):</span>
          {alignmentSummary}
        </div>
      </div>

      {/* Graph Visual Pipeline: Source Claim -> Derived Claim -> Semantic Change */}
      <div className="mt-8 relative z-10">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#2EF2C2]" />
          <span>مسار التحول النصي (Transformation Graph Pipeline)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch relative">
          
          {/* Card 1: Source Claim */}
          <div className="bg-[#12183F] border border-[#263168] rounded-xl p-4 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-[#2EF2C2] bg-[#2EF2C2]/10 px-2 py-0.5 rounded border border-[#2EF2C2]/30">
                  النص المصدر الأصلي
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Source Claim</span>
              </div>
              <p className="text-sm font-serif text-slate-200 leading-relaxed pt-1">
                {sourceText}
              </p>
            </div>
            {activeDelta && (
              <div className="mt-4 pt-3 border-t border-[#1F2A66] text-xs">
                <span className="text-[11px] text-slate-400 block mb-1">الموضع المرصود في المصدر:</span>
                <span className="text-[#2EF2C2] bg-[#2EF2C2]/10 px-2 py-0.5 rounded font-mono text-xs inline-block">
                  «{activeDelta.source_span}»
                </span>
              </div>
            )}
          </div>

          {/* Card 2: Derived Claim */}
          <div className="bg-[#12183F] border border-[#D4AF37]/50 rounded-xl p-4 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded border border-[#D4AF37]/30">
                  المحتوى المشتق ({derivedType})
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Derived Span</span>
              </div>
              <p className="text-sm font-serif text-slate-200 leading-relaxed pt-1">
                {derivedText}
              </p>
            </div>
            {activeDelta && (
              <div className="mt-4 pt-3 border-t border-[#1F2A66] text-xs">
                <span className="text-[11px] text-slate-400 block mb-1">الموضع المقابل في المشتق:</span>
                <span className="text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded font-mono text-xs inline-block">
                  «{activeDelta.derived_span}»
                </span>
              </div>
            )}
          </div>

          {/* Card 3: Detected Semantic Change */}
          <div className="bg-[#12183F] border border-[#6150EA]/60 rounded-xl p-4 flex flex-col justify-between shadow-md">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-[#A855F7] bg-[#A855F7]/10 px-2 py-0.5 rounded border border-[#A855F7]/30">
                  الانزياح الدلالي المرصود
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Semantic Change</span>
              </div>
              {activeDelta ? (
                <div className="space-y-3 pt-1">
                  <SemanticDeltaBadge category={activeDelta.category} />
                  <p className="text-xs text-slate-200 leading-relaxed bg-[#090D24] p-3 rounded-lg border border-[#263168]">
                    {activeDelta.explanation}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-emerald-400 pt-2 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  لم يُرصد انزياح دلالي جوهري.
                </div>
              )}
            </div>

            {activeDelta && (
              <div className="mt-4 pt-3 border-t border-[#1F2A66] flex items-center justify-between text-xs">
                <span className="text-slate-400">درجة التأثير:</span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                  activeDelta.impact_level === 'CRITICAL' 
                    ? 'text-rose-400 bg-rose-500/10 border border-rose-500/30'
                    : 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                }`}>
                  {activeDelta.impact_level === 'CRITICAL' ? 'حرج (مؤثر في المعنى)' : 'متوسط'}
                </span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Detected Deltas List */}
      {deltas.length > 0 && (
        <div className="mt-8 pt-6 border-t border-[#263168]/80">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#D4AF37]" />
              <span>قائمة الانزياحات الدلالية المكتشفة ({deltas.length})</span>
            </h4>
            <span className="text-xs text-slate-400">
              انقر على أي انزياح لتسليط الضوء عليه في المخطط
            </span>
          </div>

          <div className="space-y-3">
            {deltas.map((delta, index) => {
              const isSelected = delta.id === (activeDelta?.id || '');
              return (
                <div
                  key={delta.id}
                  onClick={() => setSelectedDeltaId(delta.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#182052] border-[#A855F7] shadow-[0_0_15px_rgba(168,85,247,0.25)]'
                      : 'bg-[#12183F]/70 border-[#263168] hover:border-slate-500'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs text-slate-400 font-bold">
                        #{index + 1}
                      </span>
                      <SemanticDeltaBadge category={delta.category} />
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {delta.id}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-200 mb-3 leading-relaxed">
                    {delta.explanation}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-[#090D24] p-2.5 rounded-lg border border-[#1A2254]">
                    <div>
                      <span className="text-slate-400 text-[10px] block">النص الأصلي:</span>
                      <span className="text-[#2EF2C2] font-mono">«{delta.source_span}»</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">النص المشتق:</span>
                      <span className="text-[#D4AF37] font-mono">«{delta.derived_span}»</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
