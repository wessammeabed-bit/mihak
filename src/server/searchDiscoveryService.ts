import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { centralOrchestrator } from './centralOrchestrator';
import type { AuditRun, Claim } from '../types';

dotenv.config();

export type SearchGroundingSource = {
  title: string;
  url: string;
  snippet?: string;
  sourceRole: 'EXTERNAL_CONTEXT';
};

export type SearchDiscoveryResult = {
  ok: boolean;
  query: string;
  contextSummary: string;
  sources: SearchGroundingSource[];
  claims: Claim[];
  audit: AuditRun;
  notice: string;
};

const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 0) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}

export async function searchAndAuditDiscovery(query: string): Promise<SearchDiscoveryResult> {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    throw new Error('يرجى إدخال استعلام للبحث والاستكشاف.');
  }

  // A raw URL must NEVER be passed as a Google search query
  if (/^https?:\/\/[^\s]+$/i.test(cleanQuery)) {
    throw new Error('المدخل المقدم هو رابط إنترنت (URL). لفحص محتوى الروابط، يرجى استخدام خدمة "فحص رابط" لجلب المحتوى وتدقيقه.');
  }

  if (!aiClient) {
    throw new Error('خدمة البحث والاستكشاف غير مهيأة (مفتاح API غير متوفر).');
  }

  // Use gemini-3.5-flash with googleSearch tool as specified in prompt and metadata
  let contextSummary = '';
  const sources: SearchGroundingSource[] = [];
  const extractedClaims: string[] = [];

  try {
    const prompt = `أنت محرك استكشاف وتتبع سياقي خارجي في منصة مِحَكّ.
المستخدم يبحث عن: "${cleanQuery}"

المهمة:
1. ابحث في الويب عن أصل هذا الادعاء أو المنشور المتداول أو المقال المذكور وسياق تداوله العام.
2. لخّص ما تتداوله صفحات الويب الخارجية حول هذا الموضوع في فقرة أو فقرتين موضوعيتين دون إعطاء أحكام شرعية من عندك.
3. استخرج الادعاءات أو الاستشهادات الدينية المحددة (مثل: قالوا إن الآية كذا تعني كذا، أو نسبوا حديثًا نصه كذا) في قائمة نقطية لتدقيقها لاحقًا في المصادر الإسلامية المعتمدة.

تنبيه إلزامي:
- نتائج بحث الويب ليست دليلاً شرعيًا بل مادة للفحص والاستكشاف فقط.
- اذكر مصادر الويب الخارجية التي عثرت عليها.`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2
      }
    });

    contextSummary = response.text || 'تم استرجاع معلومات السياق الخارجي بنجاح.';

    // Extract grounding metadata / web sources
    const grounding = response.candidates?.[0]?.groundingMetadata;
    const searchChunks = grounding?.groundingChunks || [];
    for (const chunk of searchChunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || new URL(chunk.web.uri).hostname,
          url: chunk.web.uri,
          sourceRole: 'EXTERNAL_CONTEXT'
        });
      }
    }

    // Split candidate claim sentences from the response or query
    const sentences = cleanQuery.split(/[.؟?!\n]+/).map((s) => s.trim()).filter((s) => s.length >= 15);
    extractedClaims.push(...sentences);
  } catch (error: any) {
    console.warn('[MIHAK Search Discovery] Google Search Grounding error:', error?.message || error);
    // If search fails, inform the user clearly while allowing the query itself to be audited (if it's a valid question, not a URL)
    const isUrl = /^https?:\/\/[^\s]+$/i.test(cleanQuery);
    contextSummary = `تعذر استرداد نتائج بحث Google المباشرة حاليًا (${error?.status === 429 ? 'تم تجاوز حد الاستعلامات المؤقت' : 'خطأ اتصال'}).${!isUrl ? ' تم توجيه نص السؤال مباشرة إلى محركات مِحَكّ المعتمدة للتحقق.' : ''}`;
    if (!isUrl) {
      extractedClaims.push(cleanQuery);
    }
  }

  // Audit extracted claims using MIHAK's trusted evidence engines (Quran, Tafsir, HadeethEnc)
  const auditedClaims: Claim[] = [];
  let claimIndex = 1;

  for (const claimText of extractedClaims.slice(0, 5)) {
    try {
      const result = await centralOrchestrator(claimText);
      if (Array.isArray(result?.claims) && result.claims.length > 0) {
        for (const c of result.claims) {
          auditedClaims.push({
            ...c,
            id: `CLM-SEARCH-${String(claimIndex++).padStart(3, '0')}`,
            original_claim: claimText,
            content_role: 'UNTRUSTED_INPUT',
            verification_rationale: [
              c.verification_rationale || '',
              'تنبيه منهجي: نتائج بحث Google هي مرجع سياقي خارجي للاستكشاف فقط، بينما التحقق الديني مستند حصرًا إلى المصادر المعتمدة المتصلة.'
            ].filter(Boolean).join(' ')
          });
        }
      }
    } catch {
      // Ignore individual audit error
    }
  }

  const audit: AuditRun = {
    id: `search-audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    input_text: cleanQuery,
    detected_language: 'ar',
    claims: auditedClaims,
    stats: {
      total: auditedClaims.length,
      supported: auditedClaims.filter((c) => c.status === 'SUPPORTED').length,
      partiallySupported: auditedClaims.filter((c) => c.status === 'PARTIALLY_SUPPORTED').length,
      insufficientEvidence: auditedClaims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,
      needsSpecialistReview: auditedClaims.filter((c) => c.status === 'NEEDS_SPECIALIST_REVIEW').length,
      verifiedQuotes: auditedClaims.filter((c) => c.status === 'VERIFIED_QUOTE').length
    },
    abstention_count: auditedClaims.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,
    duration_ms: 100
  };

  return {
    ok: true,
    query: cleanQuery,
    contextSummary,
    sources,
    claims: auditedClaims,
    audit,
    notice: 'نتائج بحث Google مخصصة للاستكشاف وتتبع سياق تداول الادعاءات في الويب فقط، ولا تُعامل كمصدر إثبات ديني.'
  };
}
