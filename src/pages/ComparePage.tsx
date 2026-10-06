import React, { useState } from 'react';
import {
  AlertCircle,
  FileText,
  GitCompare,
  Loader2,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Layers,
  Scale
} from 'lucide-react';
import { ComparisonRun } from '../types';
import { SemanticDiffGraph } from '../components/SemanticDiffGraph';

export const ComparePage: React.FC = () => {
  const [sourceText, setSourceText] = useState<string>('');
  const [derivedText, setDerivedText] = useState<string>('');
  const [derivedType, setDerivedType] = useState<string>('إعادة صياغة ذكاء اصطناعي (AI Rewrite)');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonRun | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!sourceText.trim() || !derivedText.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setComparisonResult(null);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceText: sourceText.trim(),
          derivedText: derivedText.trim(),
          derivedType
        })
      });

      if (!res.ok) {
        throw new Error(`Comparison service responded with code ${res.status}`);
      }

      const data: ComparisonRun = await res.json();
      setComparisonResult(data);
    } catch (err) {
      console.error('Compare failed:', err);
      setErrorMsg('تعذر إكمال المقارنة الآن. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = () => {
    setSourceText('');
    setDerivedText('');
    setComparisonResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-8" dir="rtl">
      {/* Header */}
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#D4A64A]/30 bg-[#0B1730] px-3.5 py-1 text-xs text-[#E0B85C]">
          <Scale className="w-3.5 h-3.5" />
          <span>مختبر رصد التحول الدلالي</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white font-serif">
          مقارنة سلامة النقل والتحول الدلالي
        </h1>
        <p className="max-w-3xl text-sm sm:text-base leading-7 text-[#94A3B8]">
          قارن النص الأصلي بترجمة أو تلخيص أو إعادة صياغة، وسيقوم مِحَكّ برصد مواضع الإضافة والحذف وتغير النفي واليقين وانزياح المصطلحات.
        </p>
      </header>

      {/* Main Comparison Workspace */}
      <section className="mushaf-card p-6 sm:p-8 space-y-6 bg-[#0B1730]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#162D52]">
          <span className="text-sm text-[#E2E8F0] inline-flex items-center gap-2 font-medium">
            <SlidersHorizontal className="w-4 h-4 text-[#D4A64A]" />
            نوع المحتوى المشتق أو أسلوب النقل:
          </span>

          <div className="flex flex-wrap gap-2">
            {[
              'إعادة صياغة ذكاء اصطناعي (AI Rewrite)',
              'ترجمة (Translation)',
              'تلخيص (Summary)',
              'اقتباس صحفي'
            ].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDerivedType(type)}
                className={[
                  'px-3.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer',
                  derivedType === type
                    ? 'bg-[#112240] text-[#D4A64A] border-[#D4A64A]/40 shadow-[0_0_10px_rgba(212,166,74,0.1)]'
                    : 'bg-[#071326] text-[#94A3B8] border-[#162D52] hover:text-white'
                ].join(' ')}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs text-[#38BDF8]">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <FileText className="w-4 h-4" />
                النص الأصلي (المصدر المرجعي)
              </span>
              <span className="text-[#94A3B8]">{sourceText.length} حرف</span>
            </label>

            <textarea
              rows={8}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="ألصق النص الأصلي المعتمد هنا..."
              className="w-full rounded-xl border border-[#162D52] bg-[#071326] p-4 text-sm leading-7 text-white placeholder:text-[#94A3B8]/60 outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/30 font-serif"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs text-[#D4A64A]">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <GitCompare className="w-4 h-4" />
                النص المشتق (المراد فحصه)
              </span>
              <span className="text-[#94A3B8]">{derivedText.length} حرف</span>
            </label>

            <textarea
              rows={8}
              value={derivedText}
              onChange={(e) => setDerivedText(e.target.value)}
              placeholder="ألصق الترجمة أو الملخص أو النص المشتق هنا..."
              className="w-full rounded-xl border border-[#162D52] bg-[#071326] p-4 text-sm leading-7 text-white placeholder:text-[#94A3B8]/60 outline-none focus:border-[#D4A64A] focus:ring-1 focus:ring-[#D4A64A]/30 font-serif"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={clearAll}
            disabled={isLoading || (!sourceText && !derivedText)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-[#94A3B8] hover:text-white disabled:opacity-30 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            مسح النصين
          </button>

          <button
            type="button"
            onClick={handleCompare}
            disabled={isLoading || !sourceText.trim() || !derivedText.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#D4A64A] to-[#E0B85C] px-8 py-3.5 font-bold text-[#071326] transition hover:brightness-110 disabled:opacity-40 cursor-pointer shadow-[0_0_15px_rgba(212,166,74,0.2)]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                جاري رصد الفروق الدلالية...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                تدقيق ومقارنة النصين
              </>
            )}
          </button>
        </div>
      </section>

      {/* Comparison Results */}
      {comparisonResult && (
        <section className="animate-fadeIn">
          <SemanticDiffGraph
            sourceText={comparisonResult.source_text}
            derivedText={comparisonResult.derived_text}
            derivedType={comparisonResult.derived_type}
            deltas={comparisonResult.deltas}
            integrityScore={comparisonResult.integrity_score}
            alignmentSummary={comparisonResult.alignment_summary}
          />
        </section>
      )}
    </div>
  );
};
