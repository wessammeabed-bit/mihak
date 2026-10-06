import React, { useMemo, useState, useEffect } from 'react';

import {

  Search,

  Loader2,

  AlertCircle,

  ChevronDown,

  BookOpen,

  RotateCcw,

  Link2,

  FileText,

  ShieldCheck,

  ExternalLink,

  Mic,

  Globe,

  Bookmark,

  Check,

  Clock,

  Sparkles,

  Info

} from 'lucide-react';



import { AuditRun, Claim } from '../types';

import { ConfidenceScore, ConfidenceScoreBadge } from '../components/ConfidenceScore';

import { AudioRecorder } from '../components/AudioRecorder';

import { saveAuditToFirestore, UserProfile } from '../services/firebase';

import type { TranscriptSegment } from '../server/transcriptionService';

import type { MediaAuditMeta } from '../server/mediaAuditAdapter';

import type { SearchDiscoveryResult } from '../server/searchDiscoveryService';



type ResultStyle = {

  label: string;

  description?: string;

  className: string;

};



function getClaimStyle(claim: Claim): ResultStyle {

  if (claim.evidence_relation === 'ATTRIBUTION_MISMATCH') {

    return {

      label: 'المرجع غير مطابق',

      description: 'النص موجود، لكن السورة أو الآية المنسوب إليها غير مطابقة.',

      className: 'text-amber-300 bg-amber-400/10 border-amber-400/30'

    };

  }



  if (claim.evidence_relation === 'SCOPE_MISMATCH') {

    return {

      label: 'اختلاف في نطاق المعنى',

      description: 'الدليل لا يدعم الادعاء بصيغته أو نطاقه الكامل.',

      className: 'text-amber-300 bg-amber-400/10 border-amber-400/30'

    };

  }



  switch (claim.status) {

    case 'VERIFIED_QUOTE':

      return {

        label: 'اقتباس موثّق',

        className: 'text-[#2EF2C2] bg-[#2EF2C2]/10 border-[#2EF2C2]/30'

      };



    case 'SUPPORTED':

      return {

        label: 'مدعوم بالدليل',

        className: 'text-[#2EF2C2] bg-[#2EF2C2]/10 border-[#2EF2C2]/30'

      };



    case 'PARTIALLY_SUPPORTED':

      return {

        label: 'مدعوم جزئيًا',

        description: 'الدليل يدعم جزءًا من الادعاء، وليس الصياغة كاملة.',

        className: 'text-amber-300 bg-amber-400/10 border-amber-400/30'

      };



    case 'NEEDS_SPECIALIST_REVIEW':

      return {

        label: 'يحتاج مراجعة متخصصة',

        className: 'text-indigo-300 bg-indigo-400/10 border-indigo-400/30'

      };



    case 'SOURCE_COVERAGE_GAP':

      return {

        label: 'فجوة في تغطية المصادر',

        description: 'المسألة تتطلب مراجع شرعية متخصصة غير متصلة حالياً بالمحرك المعتمد.',

        className: 'text-rose-300 bg-rose-400/10 border-rose-400/30'

      };



    default:

      return {

        label: 'الأدلة غير كافية',

        className: 'text-orange-300 bg-orange-400/10 border-orange-400/30'

      };

  }

}



function isDirectKnowledgeAnswer(result: AuditRun): boolean {

  if (result.claims.length !== 1) return false;



  const claim = result.claims[0];

  const rationale = String(claim.verification_rationale || '');

  const text = String(claim.claim_text || '');

  const isPositiveAnswer =

    claim.status === 'SUPPORTED' || claim.status === 'VERIFIED_QUOTE';



  return (

    rationale.includes('الإجابة مستخرجة من المصدر') ||

    rationale.includes('الإجابة مستخرجة من المصدر/المصادر') ||

    rationale.includes('المصدر المحلي المتصل') ||

    rationale.includes('المصادر المحلية المتصلة') ||

    (isPositiveAnswer && ((text.includes('س:') && text.includes('ج:')) || (/\bQ:\s*/i.test(text) && /\bA:\s*/i.test(text))))

  );

}



type DirectAnswerView = {
  question: string;
  cards: string[];
  sources: string[];
  language: 'ar' | 'en';
};

function parseDirectAnswerText(value: string): DirectAnswerView {
  const text = String(value || '').replace(/\r/g, '').trim();

  const language: 'ar' | 'en' =
    /(^|\n)\s*Q:\s*/i.test(text) && !/(^|\n)\s*س:\s*/.test(text)
      ? 'en'
      : 'ar';

  const sections = text
    .split(/\n(?=(?:س|ج|المصدر|Q|A|Source)\s*:)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  let question = '';
  const cards: string[] = [];
  const sources: string[] = [];

  for (const sec of sections) {
    if (/^(?:س|Q)\s*:/i.test(sec)) {
      question = sec.replace(/^(?:س|Q)\s*:\s*/i, '').trim();
    } else if (/^(?:المصدر|Source)\s*:/i.test(sec)) {
      const srcLines = sec
        .replace(/^(?:المصدر|Source)\s*:\s*/i, '')
        .split('\n')
        .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean);
      sources.push(...srcLines);
    } else {
      const cleaned = sec.replace(/^(?:ج|A)\s*:\s*/i, '').trim();
      if (cleaned) cards.push(cleaned);
    }
  }

  return { question, cards, sources, language };
}

function extractSourceLabel(claim: Claim): string | null {

  if (claim.evidence?.source_name) {

    return claim.evidence.source_name;

  }



  const rationale = String(claim.verification_rationale || '');

  const match = rationale.match(

    /(?:المصدر\/المصادر المحلية المتصلة|المصادر المحلية المتصلة|المصدر المحلي المتصل)\s*:\s*([^\\.\n]+)/

  );



  return match?.[1]?.trim() || null;

}



const DirectAnswerCard: React.FC<{ claim: Claim }> = ({ claim }) => {

  const sourceLabel = extractSourceLabel(claim);

  const parsed = parseDirectAnswerText(claim.claim_text);

  const isEnglish = parsed.language === 'en';

  const evidenceSource = String(sourceLabel || claim.evidence?.source_name || '');

  const looksQuranic = evidenceSource.includes('القرآن');



  return (

    <article className="rounded-2xl border border-[#2EF2C2]/25 bg-[#0C1428] overflow-hidden shadow-[0_0_35px_rgba(46,242,194,0.06)]">

      <div className="p-5 sm:p-7 space-y-5">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {parsed.question ? (

            <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 flex-1 min-w-0">

              <p className="text-xs text-slate-500 mb-1">{isEnglish ? 'Question' : 'السؤال'}</p>

              <p className="text-base sm:text-lg leading-8 text-white font-semibold">

                {parsed.question}

              </p>

            </div>

          ) : <div className="flex-1" />}

          <div className="shrink-0 self-start sm:self-center">

            <ConfidenceScoreBadge claim={claim} size="md" />

          </div>

        </div>



        {parsed.cards.length > 0 ? (

          <div className="grid gap-3">

            {parsed.cards.map((card, index) => (

              <div

                key={`${index}-${card.slice(0, 28)}`}

                className="rounded-xl border border-[#2EF2C2]/25 bg-[#2EF2C2]/[0.055] px-4 py-4 sm:px-5 shadow-[inset_0_0_24px_rgba(46,242,194,0.025)]"

              >

                <p className="whitespace-pre-line text-[15px] sm:text-base leading-8 text-emerald-50">

                  {card}

                </p>

              </div>

            ))}

          </div>

        ) : (

          <p className="whitespace-pre-line text-lg leading-9 text-white">

            {claim.claim_text}

          </p>

        )}



        {(parsed.sources.length > 0 || sourceLabel || claim.evidence) && (

          <details className="group border-t border-[#2EF2C2]/15 pt-4">

            <summary className="list-none cursor-pointer flex items-center justify-between text-sm text-[#2EF2C2] select-none">

              <span>{isEnglish ? 'Show source and details' : 'عرض المصدر والتفاصيل'}</span>

              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />

            </summary>



            <div className="pt-4 space-y-3 text-sm text-slate-300">

              {(parsed.sources.length > 0 || sourceLabel) && (

                <div className="rounded-xl border border-[#2EF2C2]/15 bg-[#081324] p-4 space-y-2">

                  <div className="flex items-start gap-2">

                    <BookOpen className="w-4 h-4 mt-0.5 text-[#2EF2C2] shrink-0" />

                    <p className="text-emerald-100 font-semibold">{isEnglish ? 'Trusted sources' : 'المصادر المعتمدة'}</p>

                  </div>

                  {(parsed.sources.length > 0 ? parsed.sources : [sourceLabel as string]).map((source, index) => (

                    <p key={`${source}-${index}`} className="text-slate-300 leading-7">

                      • {source}

                    </p>

                  ))}

                </div>

              )}



              {claim.evidence?.canonical_reference && (

                <p className="leading-7">

                  <span className="text-slate-500">{isEnglish ? 'Reference: ' : 'المرجع: '}</span>

                  {claim.evidence.canonical_reference}

                </p>

              )}



              {claim.evidence?.raw_text && (

                <div className="max-h-80 overflow-y-auto rounded-xl border border-[#2EF2C2]/20 bg-[#090D24] px-4 py-4 text-sm sm:text-base leading-8 text-emerald-100 whitespace-pre-line">

                  {looksQuranic ? `﴿ ${claim.evidence.raw_text} ﴾` : claim.evidence.raw_text}

                </div>

              )}

            </div>

          </details>

        )}

      </div>

    </article>

  );

};



const ClaimResultCard: React.FC<{ claim: Claim }> = ({ claim }) => {
  const style = getClaimStyle(claim);

  const isSemanticQuranEvidence =
    claim.evidence?.source_id === 'quran-semantic-rag';

  const quranEvidenceItems = isSemanticQuranEvidence
    ? String(claim.evidence?.raw_text || '')
        .split('\n')
        .filter(Boolean)
        .map((line, index) => {
          const separator = line.indexOf(' — ');

          const verseText =
            separator >= 0
              ? line.slice(0, separator).trim()
              : line.trim();

          const tafsirText =
            separator >= 0
              ? line.slice(separator + 3).trim()
              : '';

          const references = String(
            claim.evidence?.canonical_reference || ''
          )
            .split('|')
            .map((ref) => ref.trim())
            .filter(Boolean);

          return {
            reference: references[index] || `الدليل ${index + 1}`,
            verseText,
            tafsirText
          };
        })
    : [];



  return (

    <article className="rounded-2xl border border-[#263168] bg-[#101634] overflow-hidden">

      <div className="p-5 sm:p-6 space-y-4">

        <div className="flex flex-wrap items-center justify-between gap-2">

          <div className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${style.className}`}>

            {style.label}

          </div>

          <ConfidenceScoreBadge claim={claim} />

        </div>



        <div className="space-y-2">

          <p className="text-xs text-slate-500">الادعاء</p>

          <p className="whitespace-pre-line text-base sm:text-lg text-white leading-8 font-medium">

            {claim.original_claim || claim.claim_text}

          </p>

        </div>



        {claim.retrieval_query_ar && (

          <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-3 space-y-1">

            <p className="text-xs text-sky-300 font-semibold">صياغة الاسترجاع بالعربية (للبحث في المصادر فقط):</p>

            <p className="text-sm text-sky-100 font-serif leading-7">{claim.retrieval_query_ar}</p>

            <p className="text-[11px] text-slate-400">

              استُخدمت هذه الصياغة كطبقة لغوية للاسترجاع من المصادر المعتمدة فقط، وليست دليلاً.

            </p>

          </div>

        )}



        {style.description && (

          <p className="text-sm leading-7 text-slate-400">

            {style.description}

          </p>

        )}



        {claim.source_url && (

          <div className="flex items-center gap-2 pt-1 text-xs text-slate-400">

            <span className="text-slate-500 shrink-0">مصدر المحتوى محل الفحص:</span>

            <a

              href={claim.source_url}

              target="_blank"

              rel="noreferrer"

              className="text-[#2EF2C2] hover:underline truncate inline-flex items-center gap-1"

            >

              <ExternalLink className="w-3 h-3 shrink-0" />

              {claim.source_title || claim.source_url}

            </a>

          </div>

        )}



        <details className="group border-t border-[#263168] pt-3">

          <summary className="list-none cursor-pointer flex items-center justify-between text-sm text-[#2EF2C2] select-none">

            <span>عرض الدليل والتفاصيل</span>

            <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />

          </summary>



          <div className="pt-4 space-y-4">

          {claim.evidence && (
  <>
    {isSemanticQuranEvidence && quranEvidenceItems.length > 0 ? (
      <div className="space-y-4">

        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 mt-0.5 text-[#2EF2C2] shrink-0" />

          <p className="text-xs text-slate-400">
            المصدر المعتمد: {claim.evidence.source_name}
          </p>
        </div>

        {quranEvidenceItems.map((item, index) => (
          <div
            key={`${item.reference}-${index}`}
            className="rounded-xl border border-[#2EF2C2]/20 bg-[#090D24] p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[#2EF2C2]">
                الدليل {index + 1}
              </p>

              <p className="text-sm font-semibold text-white">
                {item.reference}
              </p>
            </div>

            <div className="rounded-lg bg-black/10 px-4 py-3 text-center">
              <p className="text-lg sm:text-xl leading-10 text-emerald-100">
                ﴿ {item.verseText} ﴾
              </p>
            </div>

            {item.tafsirText && (
              <div className="border-t border-[#263168] pt-3">
                <p className="text-xs text-slate-500 mb-1">
                  التفسير الميسر
                </p>

                <p className="text-sm leading-7 text-slate-300">
                  {item.tafsirText}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    ) : (
      <>
        <div className="flex items-start gap-2">
          <BookOpen className="w-4 h-4 mt-0.5 text-[#2EF2C2] shrink-0" />

          <div className="space-y-1">
            <p className="text-sm text-white font-semibold">
              {claim.evidence.canonical_reference}
            </p>

            <p className="text-xs text-slate-400">
              المصدر المعتمد: {claim.evidence.source_name}
            </p>
          </div>
        </div>

        {claim.evidence.raw_text && (
          <div className="rounded-xl bg-[#090D24] border border-[#2EF2C2]/20 px-4 py-4 text-center text-lg sm:text-xl leading-10 text-emerald-100">
            {claim.evidence.raw_text}
          </div>
        )}
      </>
    )}
  </>
)}


            {claim.verification_rationale && (

              <div className="space-y-2">

                <p className="text-xs text-slate-500">سبب التصنيف</p>

                <p className="text-sm leading-7 text-slate-300">

                  {claim.verification_rationale}

                </p>

              </div>

            )}



            {claim.specialist_review_reason && (

              <div className="rounded-lg border border-indigo-400/20 bg-indigo-400/5 p-3 text-xs leading-6 text-indigo-200">

                {claim.specialist_review_reason}

              </div>

            )}

          </div>

        </details>

      </div>

    </article>

  );

};



type InputMode = 'text' | 'url' | 'audio' | 'search';



type ExternalSourceMeta = {

  requestedUrl: string;

  finalUrl: string;

  hostname: string;

  title: string;

  kind: string;

  contentType: string;

  detectedLanguage?: 'ar' | 'en' | 'mixed' | 'unknown';

  extractedCharacters: number;

  extractedWordCount?: number;

  extractionMethod?: string;

  candidateCount: number;

  auditedCount: number;

  skippedNonArabicCount: number;

  translatedForRetrievalCount?: number;

  sourceRole: 'UNTRUSTED_INPUT';

  trustNotice: string;

};



type ExternalAuditResponse = {

  ok: true;

  source: ExternalSourceMeta;

  audit: AuditRun;

};



interface AuditPageProps {

  user?: UserProfile | null;

  onLoginRequest?: () => void;

  onOpenHistory?: () => void;

  loadedAudit?: { audit: AuditRun; metadata: any } | null;

}



export const AuditPage: React.FC<AuditPageProps> = ({

  user,

  onLoginRequest,

  onOpenHistory,

  loadedAudit

}) => {

  const [inputMode, setInputMode] = useState<InputMode>('text');

  const [inputText, setInputText] = useState<string>('');

  const [urlInput, setUrlInput] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState<string>('');

  const [audioPayload, setAudioPayload] = useState<{ base64: string; mimeType: string; fileName?: string } | null>(null);



  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [loadingStep, setLoadingStep] = useState<string>('');

  const [auditResult, setAuditResult] = useState<AuditRun | null>(null);

  const [externalMeta, setExternalMeta] = useState<ExternalSourceMeta | null>(null);

  const [mediaMeta, setMediaMeta] = useState<MediaAuditMeta | null>(null);

  const [transcriptData, setTranscriptData] = useState<{ fullText: string; segments: TranscriptSegment[] } | null>(null);

  const [searchMeta, setSearchMeta] = useState<SearchDiscoveryResult | null>(null);



  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isSearchingContext, setIsSearchingContext] = useState<boolean>(false);

  const [searchContextNotice, setSearchContextNotice] = useState<string | null>(null);



  // Sync loaded audit from history drawer

  useEffect(() => {

    if (loadedAudit) {

      setAuditResult(loadedAudit.audit);

      setExternalMeta(null);

      setMediaMeta(null);

      setTranscriptData(null);

      setSearchMeta(null);

      setSaveStatus('saved');

      setSaveMessage('تم تحميل النتيجة من السجل الشخصي');

    }

  }, [loadedAudit]);



  const directAnswer = useMemo(() => {

    if (externalMeta || mediaMeta || searchMeta || !auditResult || !isDirectKnowledgeAnswer(auditResult)) {

      return null;

    }

    return auditResult.claims[0] || null;

  }, [auditResult, externalMeta, mediaMeta, searchMeta]);



  const handleFetchSearchContext = async () => {

    if (!externalMeta || isSearchingContext) return;

    setIsSearchingContext(true);

    setSearchContextNotice(null);



    // Pick claim or title as the search query (never search the raw URL string!)

    const query = externalMeta.title || (auditResult?.claims[0]?.claim_text) || '';

    if (!query) {

      setIsSearchingContext(false);

      return;

    }



    try {

      const response = await fetch('/api/search-discovery', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ query })

      });

      const payload = await response.json();

      if (!response.ok) {

        setSearchContextNotice('تعذر تحميل سياق إضافي من Google Search حاليًا، لكن فحص محتوى الرابط استمر بشكل طبيعي.');

      } else {

        setSearchMeta(payload as SearchDiscoveryResult);

      }

    } catch {

      setSearchContextNotice('تعذر تحميل سياق إضافي من Google Search حاليًا، لكن فحص محتوى الرابط استمر بشكل طبيعي.');

    } finally {

      setIsSearchingContext(false);

    }

  };



  const handleAnalyze = async () => {

    setIsLoading(true);

    setErrorMsg(null);

    setAuditResult(null);

    setExternalMeta(null);

    setMediaMeta(null);

    setTranscriptData(null);

    setSearchMeta(null);

    setSearchContextNotice(null);

    setSaveStatus('idle');

    setSaveMessage(null);



    try {

      // 1. Priority to URL Detection:

      // If user selected 'url' mode OR pasted an http/https URL in any mode

      const isExplicitUrlMode = inputMode === 'url';

      const activeRaw = (

        isExplicitUrlMode ? urlInput :

        inputMode === 'search' ? searchQuery :

        inputText

      ).trim();



      const isHttpUrl = /^https?:\/\/[^\s]+$/i.test(activeRaw);



      if (isExplicitUrlMode || isHttpUrl) {

        const targetUrl = isExplicitUrlMode ? urlInput.trim() : activeRaw;

        if (!targetUrl) return;



        setLoadingStep('جاري جلب وفحص محتوى الرابط الخارجي...');

        const response = await fetch('/api/audit-url', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ url: targetUrl })

        });

        const payload = await response.json();

        if (!response.ok) throw new Error(payload?.error || `فشل فحص الرابط: ${response.status}`);

        const data = payload as ExternalAuditResponse;

        setExternalMeta(data.source);

        setAuditResult(data.audit);

        setSearchMeta(null); // Never show search panel for normal URL audit!

        return;

      }



      if (inputMode === 'text') {

        const text = inputText.trim();

        if (!text) return;



        setLoadingStep('جاري تحليل وتدقيق النص في المصادر المعتمدة...');

        const response = await fetch('/api/audit', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ text })

        });

        const payload = await response.json();

        if (!response.ok) throw new Error(payload?.error || `فشل التدقيق: ${response.status}`);

        setAuditResult(payload as AuditRun);

        setSearchMeta(null);



      } else if (inputMode === 'audio') {

        if (!audioPayload) {

          throw new Error('يرجى تسجيل صوتي مباشر أو رفع ملف صوتي أولاً.');

        }



        const isVideo = audioPayload.mimeType.startsWith('video/');

        setLoadingStep(

          isVideo

            ? 'جاري تفريغ المحتوى المنطوق من مقطع الفيديو...'

            : 'جاري التفريغ الصوتي بنموذج gemini-3.5-transcribe...'

        );

        const response = await fetch('/api/audit-audio', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({

            audioBase64: audioPayload.base64,

            mimeType: audioPayload.mimeType,

            fileName: audioPayload.fileName

          })

        });

        const payload = await response.json();

        if (!response.ok) throw new Error(payload?.error || `فشل تدقيق الصوت: ${response.status}`);

        setMediaMeta(payload.media);

        setTranscriptData(payload.transcript);

        setAuditResult(payload.audit);

        setSearchMeta(null);



      } else if (inputMode === 'search') {

        const query = searchQuery.trim();

        if (!query) return;



        setLoadingStep('جاري استكشاف وتتبع سياق الادعاء عبر بحث Google...');

        const response = await fetch('/api/search-discovery', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify({ query })

        });

        const payload = await response.json();

        if (!response.ok) throw new Error(payload?.error || `فشل الاستكشاف: ${response.status}`);

        setSearchMeta(payload as SearchDiscoveryResult);

        setAuditResult(payload.audit);

      }

    } catch (error: any) {

      console.error('MIHAK audit failed:', error);

      let msg = String(error?.message || 'تعذر إكمال التدقيق حاليًا. يرجى المحاولة مرة أخرى.');

      if (msg.includes('base64') || msg.includes('data:') || msg.length > 250) {

        msg = 'تعذر تفريغ أو تدقيق المقطع. يرجى التأكد من سلامة الملف ووضوح الصوت والمحاولة مرة أخرى.';

      }

      setErrorMsg(msg);

    } finally {

      setIsLoading(false);

      setLoadingStep('');

    }

  };



  const handleSaveAudit = async () => {

    if (!auditResult) return;



    if (!user) {

      if (onLoginRequest) {

        onLoginRequest();

      } else {

        alert('يرجى تسجيل الدخول بحساب Google لحفظ نتائج التدقيق في سجلك الشخصي.');

      }

      return;

    }



    setSaveStatus('saving');

    try {

      const title =

        inputMode === 'url' ? externalMeta?.title || urlInput :

        inputMode === 'audio' ? mediaMeta?.fileName || 'تدقيق مقطع صوتي' :

        inputMode === 'search' ? searchQuery :

        inputText.slice(0, 100);



      await saveAuditToFirestore(auditResult, {

        inputType: inputMode,

        title,

        originalUrl: inputMode === 'url' ? externalMeta?.finalUrl || urlInput : undefined

      });



      setSaveStatus('saved');

      setSaveMessage('تم حفظ نتيجة التدقيق بنجاح في سجلك.');

    } catch (err: any) {

      console.error('Failed to save audit:', err);

      setSaveStatus('error');

      setSaveMessage(err?.message || 'تعذر الحفظ في قاعدة البيانات.');

    }

  };



  const handleClear = () => {

    setInputText('');

    setUrlInput('');

    setSearchQuery('');

    setAudioPayload(null);

    setAuditResult(null);

    setExternalMeta(null);

    setMediaMeta(null);

    setTranscriptData(null);

    setSearchMeta(null);

    setSearchContextNotice(null);

    setIsSearchingContext(false);

    setErrorMsg(null);

    setSaveStatus('idle');

    setSaveMessage(null);

  };



  const switchMode = (mode: InputMode) => {

    if (isLoading) return;

    setInputMode(mode);

    setAuditResult(null);

    setExternalMeta(null);

    setMediaMeta(null);

    setTranscriptData(null);

    setSearchMeta(null);

    setSearchContextNotice(null);

    setIsSearchingContext(false);

    setErrorMsg(null);

    setSaveStatus('idle');

    setSaveMessage(null);

  };



  return (

    <div className="max-w-4xl mx-auto pb-16 space-y-7" dir="rtl">

      <header className="space-y-2">

        <h1 className="text-3xl sm:text-4xl font-bold text-white">

          تدقيق المحتوى

        </h1>

        <p className="text-sm sm:text-base text-slate-400 leading-7">

          مدقق سلامة المحتوى الإسلامي: تتبع الادعاءات من النصوص والروابط والتسجيلات إلى المصادر المعتمدة.

        </p>

      </header>



      {/* Main Mode Selector */}

      <section className="rounded-2xl border border-[#263168] bg-[#0B0F28] p-4 sm:p-6 space-y-5">

        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#263168] bg-[#090D24] p-1">

          <button

            type="button"

            onClick={() => switchMode('text')}

            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${

              inputMode === 'text'

                ? 'bg-[#2EF2C2] text-[#081024]'

                : 'text-slate-400 hover:text-white'

            }`}

          >

            <FileText className="w-4 h-4" />

            نص أو سؤال

          </button>



          <button

            type="button"

            onClick={() => switchMode('url')}

            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${

              inputMode === 'url'

                ? 'bg-[#2EF2C2] text-[#081024]'

                : 'text-slate-400 hover:text-white'

            }`}

          >

            <Link2 className="w-4 h-4" />

            فحص رابط

          </button>



          <button

            type="button"

            onClick={() => switchMode('audio')}

            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${

              inputMode === 'audio'

                ? 'bg-[#2EF2C2] text-[#081024]'

                : 'text-slate-400 hover:text-white'

            }`}

          >

            <Mic className="w-4 h-4" />

            صوت / فيديو

          </button>



          <button

            type="button"

            onClick={() => switchMode('search')}

            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${

              inputMode === 'search'

                ? 'bg-[#2EF2C2] text-[#081024]'

                : 'text-slate-400 hover:text-white'

            }`}

          >

            <Globe className="w-4 h-4" />

            استكشاف ويب (Google)

          </button>

        </div>



        {/* Input Fields */}

        {inputMode === 'text' && (

          <textarea

            value={inputText}

            onChange={(e) => setInputText(e.target.value)}

            rows={5}

            placeholder="اكتب سؤالك الشرعي أو ألصق النص المراد تدقيق ادعاءاته..."

            className="w-full resize-y rounded-xl border border-[#263168] bg-[#12183F] px-4 py-4 text-base leading-8 text-white placeholder:text-slate-500 outline-none transition focus:border-[#2EF2C2] focus:ring-1 focus:ring-[#2EF2C2]/40"

          />

        )}



        {inputMode === 'url' && (

          <div className="space-y-3">

            <div className="relative">

              <Link2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

              <input

                type="url"

                dir="ltr"

                value={urlInput}

                onChange={(e) => setUrlInput(e.target.value)}

                placeholder="https://example.com/article"

                className="w-full rounded-xl border border-[#263168] bg-[#12183F] py-4 pr-12 pl-4 text-left text-base text-white placeholder:text-slate-600 outline-none transition focus:border-[#2EF2C2] focus:ring-1 focus:ring-[#2EF2C2]/40"

              />

            </div>



            <div className="flex items-start gap-3 rounded-xl border border-[#2EF2C2]/20 bg-[#2EF2C2]/[0.045] px-4 py-3 text-sm leading-7 text-slate-300">

              <ShieldCheck className="w-5 h-5 mt-1 text-[#2EF2C2] shrink-0" />

              <p>

                الرابط يُستخدم لاستيراد <span className="text-emerald-100 font-semibold">المحتوى محل الفحص فقط</span>،

                ولا يُعامل كمصدر لإثبات أي ادعاء. التحقق يتم حصرًا من مصادر مِحَكّ الموثوقة.

              </p>

            </div>

          </div>

        )}



        {inputMode === 'audio' && (

          <div className="space-y-3">

            <AudioRecorder

              onAudioReady={(base64, mimeType, fileName) => {

                setAudioPayload({ base64, mimeType, fileName });

              }}

              disabled={isLoading}

            />



            <div className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.045] px-4 py-3 text-sm leading-7 text-slate-300">

              <ShieldCheck className="w-5 h-5 mt-1 text-rose-400 shrink-0" />

              <p>

                يتم التفريغ الصوتي بنموذج <span className="font-mono text-white">gemini-3.5-transcribe</span> للملفات الصوتية ونموذج الوسائط المتعددة للفيديو.

                المقطع المسموع هو <span className="text-rose-200 font-semibold">مادة قيد الفحص فقط</span>، وثقة التفريغ منفصلة تمامًا عن حالة الدليل الشرعي.

              </p>

            </div>

          </div>

        )}



        {inputMode === 'search' && (

          <div className="space-y-3">

            <div className="relative">

              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

              <input

                type="text"

                value={searchQuery}

                onChange={(e) => setSearchQuery(e.target.value)}

                placeholder="ابحث عن منشور متداول أو مقال في الويب لتتبع أصله وسياقه..."

                className="w-full rounded-xl border border-[#263168] bg-[#12183F] py-4 pr-12 pl-4 text-base text-white placeholder:text-slate-500 outline-none transition focus:border-[#2EF2C2] focus:ring-1 focus:ring-[#2EF2C2]/40"

              />

            </div>



            <div className="flex items-start gap-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.045] px-4 py-3 text-sm leading-7 text-slate-300">

              <Globe className="w-5 h-5 mt-1 text-sky-400 shrink-0" />

              <p>

                البحث المدعوم بـ Google Search مخصص <span className="text-sky-200 font-semibold">للاستكشاف وتتبع سياق تداول الادعاءات</span> في صفحات الويب، ولا يمثل مصدر إثبات شرعي.

              </p>

            </div>

          </div>

        )}



        {errorMsg && (

          <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">

            <AlertCircle className="w-4 h-4 shrink-0" />

            <span>{errorMsg}</span>

          </div>

        )}



        {/* Action Buttons */}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">

          <button

            type="button"

            onClick={handleClear}

            disabled={isLoading}

            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer"

          >

            <RotateCcw className="w-4 h-4" />

            مسح

          </button>



          <button

            type="button"

            onClick={handleAnalyze}

            disabled={

              isLoading ||

              (inputMode === 'text' && !inputText.trim()) ||

              (inputMode === 'url' && !urlInput.trim()) ||

              (inputMode === 'audio' && !audioPayload) ||

              (inputMode === 'search' && !searchQuery.trim())

            }

            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2EF2C2] px-7 py-3 font-bold text-[#081024] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"

          >

            {isLoading ? (

              <>

                <Loader2 className="w-5 h-5 animate-spin" />

                <span>{loadingStep || 'جاري المعالجة...'}</span>

              </>

            ) : (

              <>

                {inputMode === 'url' ? <Link2 className="w-5 h-5" /> :

                 inputMode === 'audio' ? <Mic className="w-5 h-5" /> :

                 inputMode === 'search' ? <Globe className="w-5 h-5" /> :

                 <Search className="w-5 h-5" />}

                <span>

                  {inputMode === 'url' ? 'استيراد وفحص الرابط' :

                   inputMode === 'audio' ? 'تفريغ وتدقيق المقطع' :

                   inputMode === 'search' ? 'استكشاف وتدقيق' :

                   'تحليل وتدقيق'}

                </span>

              </>

            )}

          </button>

        </div>

      </section>



      {/* External URL Metadata Display */}

      {externalMeta && (

        <section className="rounded-2xl border border-[#2EF2C2]/25 bg-[#0C1428] p-5 sm:p-6 space-y-4 shadow-[0_0_30px_rgba(46,242,194,0.05)]">

          <div className="flex items-start justify-between gap-4">

            <div className="space-y-1 min-w-0">

              <p className="text-xs text-[#2EF2C2] font-semibold">مصدر المحتوى محل الفحص</p>

              <h2 className="text-lg sm:text-xl font-bold text-white break-words">

                {externalMeta.title}

              </h2>

              <p className="text-sm text-slate-400">{externalMeta.hostname}</p>

            </div>

            <a

              href={externalMeta.finalUrl}

              target="_blank"

              rel="noreferrer"

              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 hover:text-white shrink-0"

            >

              فتح الرابط

              <ExternalLink className="w-3.5 h-3.5" />

            </a>

          </div>



          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">

            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">

              <p className="text-xs text-slate-500">النوع</p>

              <p className="mt-1 text-sm font-semibold text-white">{externalMeta.kind.toUpperCase()}</p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">

              <p className="text-xs text-slate-500">اللغة</p>

              <p className="mt-1 text-sm font-semibold text-white">

                {externalMeta.detectedLanguage === 'ar' ? 'العربية' :

                 externalMeta.detectedLanguage === 'en' ? 'English' :

                 externalMeta.detectedLanguage === 'mixed' ? 'مختلطة' : 'غير محدد'}

              </p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">

              <p className="text-xs text-slate-500">النص المستخرج</p>

              <p className="mt-1 text-sm font-semibold text-white">

                {externalMeta.extractedCharacters.toLocaleString('ar-EG')} حرف

              </p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">

              <p className="text-xs text-slate-500">طريقة الاستخراج</p>

              <p className="mt-1 text-xs font-mono text-emerald-400 truncate" title={externalMeta.extractionMethod}>

                {externalMeta.extractionMethod || 'تلقائي'}

              </p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">

              <p className="text-xs text-slate-500">مقاطع مرشحة</p>

              <p className="mt-1 text-sm font-semibold text-white">{externalMeta.candidateCount}</p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">

              <p className="text-xs text-slate-500">ادعاءات مدققة</p>

              <p className="mt-1 text-sm font-semibold text-white">{externalMeta.auditedCount}</p>

            </div>

          </div>



          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.045] px-4 py-3 text-sm leading-7 text-emerald-100">

            <ShieldCheck className="w-4 h-4 mt-1 shrink-0" />

            <p>{externalMeta.trustNotice}</p>

          </div>



          {/* Optional Web Context Action */}

          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <p className="text-xs text-slate-400">

              يمكنك اختياريًا البحث عن سياق وأصل هذا الادعاء عبر بحث Google دون التأثير على فحص الرابط:

            </p>

            <button

              type="button"

              onClick={handleFetchSearchContext}

              disabled={isSearchingContext}

              className="inline-flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-400/20 transition cursor-pointer disabled:opacity-50 shrink-0"

            >

              {isSearchingContext ? (

                <>

                  <Loader2 className="w-3.5 h-3.5 animate-spin" />

                  <span>جاري تتبع السياق...</span>

                </>

              ) : (

                <>

                  <Globe className="w-3.5 h-3.5 text-sky-400" />

                  <span>البحث عن سياق تداول الادعاء (بحث Google)</span>

                </>

              )}

            </button>

          </div>



          {searchContextNotice && (

            <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200">

              <AlertCircle className="w-4 h-4 shrink-0" />

              <span>{searchContextNotice}</span>

            </div>

          )}

        </section>

      )}



      {/* Audio / Video Transcript Section */}

      {transcriptData && mediaMeta && (

        <section className="rounded-2xl border border-rose-400/25 bg-[#0C1428] p-5 sm:p-6 space-y-4 shadow-[0_0_30px_rgba(244,63,94,0.05)]">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <div className="space-y-1">

              <div className="flex items-center gap-2">

                <Mic className="w-4 h-4 text-rose-400" />

                <span className="text-xs text-rose-400 font-semibold">تفريغ المحتوى الصوتي (gemini-3.5-transcribe)</span>

              </div>

              <h2 className="text-lg font-bold text-white">

                {mediaMeta.fileName || 'المقطع الصوتي المفرغ'}

              </h2>

            </div>



            {/* Separate Transcription Confidence */}

            {mediaMeta.transcriptionConfidence != null && (

              <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs text-rose-300 font-mono">

                <Sparkles className="w-3.5 h-3.5" />

                <span>ثقة التفريغ الصوتي: {Math.round(mediaMeta.transcriptionConfidence * 100)}%</span>

              </div>

            )}

          </div>



          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">

              <p className="text-slate-500">المدة</p>

              <p className="mt-1 text-sm font-semibold text-white">{mediaMeta.durationSeconds} ثانية</p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">

              <p className="text-slate-500">اللغة المنطوقة</p>

              <p className="mt-1 text-sm font-semibold text-white">{mediaMeta.detectedLanguage}</p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">

              <p className="text-slate-500">المقاطع الزمنية</p>

              <p className="mt-1 text-sm font-semibold text-white">{mediaMeta.segmentCount}</p>

            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">

              <p className="text-slate-500">ادعاءات مستخرجة</p>

              <p className="mt-1 text-sm font-semibold text-white">{mediaMeta.claimCount}</p>

            </div>

          </div>



          {/* Transcript preview with timestamps */}

          <details className="group border-t border-white/10 pt-3">

            <summary className="list-none cursor-pointer flex items-center justify-between text-xs text-slate-400 hover:text-white select-none">

              <span>عرض المقاطع الزمنية المفرغة ({transcriptData.segments.length})</span>

              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />

            </summary>



            <div className="pt-3 space-y-2 max-h-64 overflow-y-auto pr-1">

              {transcriptData.segments.map((seg, idx) => (

                <div key={idx} className="rounded-lg bg-white/[0.03] p-2.5 text-xs text-slate-300 flex items-start gap-3">

                  <span className="shrink-0 px-2 py-0.5 rounded bg-white/10 font-mono text-emerald-400 text-[11px]">

                    {seg.startTimeFormatted || '00:00'}

                  </span>

                  <p className="leading-6 flex-1">{seg.text}</p>

                </div>

              ))}

            </div>

          </details>

        </section>

      )}



      {/* Google Search Discovery Section */}

      {searchMeta && (

        <section className="rounded-2xl border border-sky-400/25 bg-[#0C1428] p-5 sm:p-6 space-y-4 shadow-[0_0_30px_rgba(56,189,248,0.05)]">

          <div className="space-y-1">

            <div className="flex items-center gap-2">

              <Globe className="w-4 h-4 text-sky-400" />

              <span className="text-xs text-sky-400 font-semibold">سياق التداول الخارجي (Google Search Grounding)</span>

            </div>

            <h2 className="text-lg font-bold text-white">

              استكشاف: &quot;{searchMeta.query}&quot;

            </h2>

          </div>



          <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-4 text-sm text-sky-100 leading-7">

            {searchMeta.contextSummary}

          </div>



          {searchMeta.sources.length > 0 && (

            <div className="space-y-2">

              <p className="text-xs text-slate-400">مصادر الويب الخارجية (مراجع سياقية للاستكشاف فقط):</p>

              <div className="flex flex-wrap gap-2">

                {searchMeta.sources.map((src, idx) => (

                  <a

                    key={idx}

                    href={src.url}

                    target="_blank"

                    rel="noreferrer"

                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5 text-xs text-slate-300 hover:text-white transition"

                  >

                    <ExternalLink className="w-3 h-3 text-sky-400" />

                    <span className="truncate max-w-[200px]">{src.title}</span>

                  </a>

                ))}

              </div>

            </div>

          )}



          <div className="flex items-start gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.045] px-4 py-3 text-sm leading-7 text-sky-200">

            <Info className="w-4 h-4 mt-1 shrink-0" />

            <p>{searchMeta.notice}</p>

          </div>

        </section>

      )}



      {/* Main Audit Results */}

      {auditResult && directAnswer && (

        <section className="space-y-4">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <h2 className="text-xl font-bold text-white">الإجابة الموثقة</h2>

            {/* Save Button */}

            <button

              type="button"

              onClick={handleSaveAudit}

              disabled={saveStatus === 'saving'}

              className="inline-flex items-center gap-2 rounded-xl border border-[#2EF2C2]/40 bg-[#2EF2C2]/10 hover:bg-[#2EF2C2]/20 px-4 py-2 text-xs font-bold text-[#2EF2C2] transition cursor-pointer"

            >

              {saveStatus === 'saved' ? <Check className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}

              <span>{saveStatus === 'saved' ? 'تم الحفظ في سجلك' : 'حفظ نتيجة التدقيق'}</span>

            </button>

          </div>



          {saveMessage && (

            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${saveStatus === 'saved' ? 'bg-emerald-400/10 border border-emerald-400/30 text-emerald-200' : 'bg-red-400/10 border border-red-400/30 text-red-200'}`}>

              <Info className="w-4 h-4" />

              <span>{saveMessage}</span>

            </div>

          )}



          <ConfidenceScore claims={[directAnswer]} />

          <DirectAnswerCard claim={directAnswer} />

        </section>

      )}



      {auditResult && !directAnswer && (

        <section className="space-y-5">

          {/* Header & Save Action */}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

            <div className="flex items-center gap-3">

              <h2 className="text-xl font-bold text-white">نتيجة التدقيق</h2>

              <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400 font-mono">

                {auditResult.claims.length}{' '}

                {auditResult.claims.length === 1 ? 'ادعاء' : 'ادعاءات'}

              </span>

            </div>



            <div className="flex items-center gap-2">

              <button

                type="button"

                onClick={handleSaveAudit}

                disabled={saveStatus === 'saving'}

                className="inline-flex items-center gap-2 rounded-xl border border-[#2EF2C2]/40 bg-[#2EF2C2]/10 hover:bg-[#2EF2C2]/20 px-4 py-2 text-xs font-bold text-[#2EF2C2] transition cursor-pointer"

              >

                {saveStatus === 'saved' ? <Check className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}

                <span>{saveStatus === 'saved' ? 'تم الحفظ في سجلك' : 'حفظ نتيجة التدقيق'}</span>

              </button>

            </div>

          </div>



          {saveMessage && (

            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${saveStatus === 'saved' ? 'bg-emerald-400/10 border border-emerald-400/30 text-emerald-200' : 'bg-red-400/10 border border-red-400/30 text-red-200'}`}>

              <Info className="w-4 h-4" />

              <span>{saveMessage}</span>

            </div>

          )}



          {auditResult.claims.length > 0 && (

            <ConfidenceScore auditRun={auditResult} claims={auditResult.claims} />

          )}



          {auditResult.claims.length === 0 ? (

            <div className="rounded-xl border border-[#263168] bg-[#101634] p-6 text-slate-300 space-y-2 text-center">

              <p className="font-semibold text-white text-base">

                لم يتم التعرف على ادعاءات دينية قابلة للتدقيق في المحتوى المدخل.

              </p>

              <p className="text-xs text-slate-400 max-w-xl mx-auto leading-6">

                تم فحص المحتوى المستورد بنجاح، لكنه لا يتضمن نصوصًا أو اقتباسات دينية صريحة تتطلب مطابقة بالمصادر المعتمدة.

              </p>

            </div>

          ) : (

            <div className="space-y-3">

              {auditResult.claims.map((claim) => (

                <ClaimResultCard key={claim.id} claim={claim} />

              ))}

            </div>

          )}



          <p className="pt-2 text-center text-xs leading-6 text-slate-500">

            مِحَكّ يوضح علاقة المحتوى بالمصادر المتاحة، ولا يصدر أحكامًا شرعية.

          </p>

        </section>

      )}

    </div>

  );

};
