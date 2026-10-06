/**
 * MIHAK — مِحَكّ
 * Semantic Provider Abstraction Layer
 *
 * Provides a resilient multi-provider AI pipeline:
 * Primary: Google Gemini (2.5-transcribe / 3.8-flash / 3.5-flash)
 * Fallback: Groq (llama-3.3-70b-versatile / whisper-large-v3) if GROQ_API_KEY is configured
 * Local Fallback: Deterministic semantic parser & BM25/token reranking if both fail
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. AI models are strictly for:
 *    - classification & planning
 *    - proposition decomposition
 *    - multilingual retrieval query generation
 *    - semantic candidate reranking
 * 2. AI model text is NEVER used as religious evidence or canonical source.
 * 3. Never expose API keys client-side.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export type ProviderName = 'gemini' | 'groq' | 'local_fallback';

export interface ProviderCallResult {
  ok: boolean;
  text?: string;
  json?: any;
  providerUsed: ProviderName;
  fallbackUsed: boolean;
  error?: string;
}

export interface CandidateItem {
  id: string | number;
  title?: string;
  text?: string;
  explanation?: string;
  source?: string;
  score?: number;
}

export interface RerankResult {
  selectedId: string | number | null;
  score: number;
  reasoning?: string;
  providerUsed: ProviderName;
  fallbackUsed: boolean;
}

const geminiKey = process.env.GEMINI_API_KEY;
let geminiClient: GoogleGenAI | null = null;

if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY' && geminiKey.trim().length > 0) {
  try {
    geminiClient = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  } catch (err) {
    console.warn('[MIHAK Semantic Provider] Gemini client init warning:', err);
  }
}

const groqKey = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'MY_GROQ_API_KEY' && process.env.GROQ_API_KEY.trim().length > 0
  ? process.env.GROQ_API_KEY.trim()
  : null;

/**
 * Checks whether an error is transient and retryable (rate limits, 503, 500, timeouts).
 */
export function isRetryableError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err).toLowerCase();
  const status = err?.status || err?.statusCode || err?.response?.status;
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('timeout')
  );
}

/**
 * Executes a call to Groq via native fetch using its OpenAI-compatible endpoint.
 */
async function callGroqChat(prompt: string, jsonMode = true, model = 'llama-3.3-70b-versatile'): Promise<string> {
  if (!groqKey) {
    throw new Error('Groq API key not configured');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are MIHAK semantic planning and reranking engine. You NEVER answer religious questions or provide scripture from memory. Return valid JSON only when requested.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      response_format: jsonMode ? { type: 'json_object' } : undefined
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error: any = new Error(`Groq API error ${response.status}: ${errorBody}`);
    error.status = response.status;
    throw error;
  }

  const data: any = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Groq returned empty response');
  }
  return content;
}

/**
 * Resilient JSON generation with retry and cross-provider failover:
 * 1. Gemini primary (models: gemini-3.8-flash -> gemini-3.5-flash -> gemini-3.5-flash-lite)
 * 2. Groq fallback (llama-3.3-70b-versatile) if GROQ_API_KEY configured
 */
export async function generateSemanticJson(
  prompt: string,
  options: {
    maxGeminiRetries?: number;
    initialBackoffMs?: number;
  } = {}
): Promise<ProviderCallResult> {
  const maxRetries = options.maxGeminiRetries ?? 2;
  const initialBackoff = options.initialBackoffMs ?? 600;

  // 1. Try Gemini
  if (geminiClient) {
    const geminiModels = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
    for (const model of geminiModels) {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const res = await geminiClient.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0
            }
          });

          const rawText = res.text || '{}';
          const parsed = JSON.parse(rawText);
          return {
            ok: true,
            text: rawText,
            json: parsed,
            providerUsed: 'gemini',
            fallbackUsed: false
          };
        } catch (err: any) {
          attempt++;
          if (isRetryableError(err) && attempt <= maxRetries) {
            const delay = initialBackoff * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          // Non-retryable or exceeded retries -> break to next model
          break;
        }
      }
    }
  }

  // 2. Try Groq fallback if configured
  if (groqKey) {
    try {
      console.log('[MIHAK Semantic Provider] Gemini unavailable; routing to Groq fallback...');
      const groqRaw = await callGroqChat(prompt, true);
      const parsed = JSON.parse(groqRaw);
      return {
        ok: true,
        text: groqRaw,
        json: parsed,
        providerUsed: 'groq',
        fallbackUsed: true
      };
    } catch (groqErr: any) {
      console.warn('[MIHAK Semantic Provider] Groq fallback failed:', groqErr?.message || groqErr);
    }
  }

  return {
    ok: false,
    providerUsed: 'local_fallback',
    fallbackUsed: true,
    error: 'All AI providers temporarily unavailable'
  };
}

/**
 * Semantic candidate reranking:
 * Evaluates candidate items against user's intended question/meaning.
 * NEVER accepts religious text or fatwa from the model; model only scores existing records.
 */
export async function rerankCandidates(
  userQuery: string,
  candidates: CandidateItem[],
  contextDomain: 'HADITH' | 'QURAN' = 'HADITH'
): Promise<RerankResult> {
  if (!candidates || candidates.length === 0) {
    return {
      selectedId: null,
      score: 0,
      providerUsed: 'local_fallback',
      fallbackUsed: false
    };
  }

  if (candidates.length === 1) {
    return {
      selectedId: candidates[0].id,
      score: candidates[0].score || 0.85,
      providerUsed: 'local_fallback',
      fallbackUsed: false
    };
  }

  const prompt = `You are MIHAK's semantic candidate reranker.
Your task is to rank the candidate ${contextDomain} records based on how well they match the USER'S INTENDED QUESTION or meaning.
Do NOT write your own answer or provide religious judgments. Only score the supplied candidates.

USER QUERY:
${JSON.stringify(userQuery)}

CANDIDATES:
${JSON.stringify(
  candidates.map((c) => ({
    id: c.id,
    title: c.title,
    snippet: (c.text || '').slice(0, 300),
    explanationSnippet: (c.explanation || '').slice(0, 200)
  }))
)}

Return JSON ONLY:
{
  "bestMatchId": "exact id of the candidate that best answers the query, or null if none match",
  "relevanceScore": 0.0 to 1.0,
  "reasoning": "brief 1-sentence reason"
}`;

  const aiResult = await generateSemanticJson(prompt, { maxGeminiRetries: 1, initialBackoffMs: 400 });
  if (aiResult.ok && aiResult.json) {
    const rawId = aiResult.json.bestMatchId;
    const score = typeof aiResult.json.relevanceScore === 'number'
      ? Math.max(0, Math.min(1, aiResult.json.relevanceScore))
      : 0.7;

    const matched = candidates.find((c) => String(c.id) === String(rawId));
    if (matched) {
      return {
        selectedId: matched.id,
        score,
        reasoning: aiResult.json.reasoning,
        providerUsed: aiResult.providerUsed,
        fallbackUsed: aiResult.fallbackUsed
      };
    }
  }

  // Local token-overlap reranking fallback
  const queryTokens = userQuery
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  let bestCandidate = candidates[0];
  let bestScore = candidates[0].score || 0;

  for (const c of candidates) {
    const textBlob = `${c.title || ''} ${c.text || ''}`.toLowerCase();
    const matches = queryTokens.filter((t) => textBlob.includes(t)).length;
    const ratio = queryTokens.length ? matches / queryTokens.length : 0;
    const combinedScore = Math.max(c.score || 0, ratio);
    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestCandidate = c;
    }
  }

  return {
    selectedId: bestCandidate.id,
    score: bestScore,
    providerUsed: 'local_fallback',
    fallbackUsed: true
  };
}

/**
 * Transcribes audio via Groq Whisper API as fallback when Gemini is unavailable.
 */
export async function transcribeWithGroqWhisper(
  audioBase64: string,
  mimeType: string,
  filename = 'audio.mp3'
): Promise<{ text: string; language?: string } | null> {
  if (!groqKey) return null;

  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    const boundary = `----MihakBoundary${Date.now()}`;
    const crlf = '\r\n';

    // Construct multipart form data
    const parts: Buffer[] = [];

    // Model field
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="model"${crlf}${crlf}whisper-large-v3${crlf}`
    ));

    // Response format field
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="response_format"${crlf}${crlf}verbose_json${crlf}`
    ));

    // File field header
    parts.push(Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}Content-Type: ${mimeType}${crlf}${crlf}`
    ));
    parts.push(buffer);
    parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`));

    const bodyBuffer = Buffer.concat(parts);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: bodyBuffer
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[MIHAK Semantic Provider] Groq Whisper returned ${res.status}: ${errText}`);
      return null;
    }

    const data: any = await res.json();
    const text = String(data?.text || '').trim();
    if (!text) return null;

    return {
      text,
      language: data?.language || 'ar'
    };
  } catch (err) {
    console.warn('[MIHAK Semantic Provider] Groq Whisper call failed:', err);
    return null;
  }
}

/* =========================================================
   HADITH SEMANTIC QUERY GENERATION & RELATION CLASSIFIER
   ========================================================= */

export interface HadithSemanticQueriesResult {
  semanticMeaning: string;
  queries: string[];
  providerUsed: ProviderName;
  fallbackUsed: boolean;
}

export type HadithRelationLabel =
  | 'DIRECT_MATCH'
  | 'STRONG_PARAPHRASE'
  | 'PARTIAL_RELATION'
  | 'UNRELATED'
  | 'AMBIGUOUS';

export interface HadithRelationResult {
  relation: HadithRelationLabel;
  confidence: number;
  reasoning: string;
  providerUsed: ProviderName;
  fallbackUsed: boolean;
}

/**
 * Local dialect and wrapper stripper when AI providers are unavailable.
 */
function localFallbackHadithQueries(clean: string): { semanticMeaning: string; queries: string[] } {
  const stripped = clean
    .replace(/[؟?،,؛;:.]+/g, ' ')
    .replace(/^(?:فين|وين|وش|ايش|شو|ماهو|ما\s+هو|هل\s+فيه?|هل\s+يوجد|ممكن|عايز|عاوز|ابغى|بدي|لو\s+سمحت)\s+/i, '')
    .replace(/^(?:الحديث|حديث)\s+(?:اللي|اللى|يلي|الذي)\s+(?:معناه|يقول|فيه|عن|بيقول)\s+/i, '')
    .replace(/^(?:اللي\s+معناه|معناه\s+ان|معناه\s+إن|معنى|معني|شرح|تفسير)\s+/i, '')
    .replace(/^(?:is\s+there\s+a\s+hadith\s+about|which\s+hadith\s+says|what\s+hadith\s+means)\s+/i, '')
    .replace(/\s+(?:بتكون|بيكون|يكون|علي|على\s+حسب|حسب)\s+/g, ' ')
    .trim();

  const quoteMatch = clean.match(/[«"'“]([^»"'”]{3,100})[»"'”]/);
  const corePhrase = quoteMatch ? quoteMatch[1].trim() : stripped;

  const queries = new Set<string>();
  if (corePhrase && corePhrase.length >= 3) {
    queries.add(corePhrase);
  }

  const words = corePhrase
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['الذي', 'التي', 'الذين', 'هذا', 'هذه', 'ذلك', 'عن', 'في', 'من', 'إلى', 'على'].includes(w));

  if (words.length >= 2) {
    queries.add(words.slice(0, 3).join(' '));
    queries.add(words.slice(-2).join(' '));
  }
  if (words.length >= 1) {
    queries.add(words.join(' '));
  }

  return {
    semanticMeaning: corePhrase || clean,
    queries: Array.from(queries).slice(0, 5)
  };
}

/**
 * Generates 3-6 concise Arabic search queries from any dialect or paraphrased question.
 * Never answers the question or generates hadith text from memory.
 */
export async function generateHadithRetrievalQueries(
  originalInput: string
): Promise<HadithSemanticQueriesResult> {
  const clean = originalInput.trim();

  const prompt = `You are MIHAK's Hadith semantic query generator.
The user enters a question or statement in Modern Standard Arabic, an Arabic dialect (Egyptian, Gulf, Levantine, Maghrebi, etc.), or English, asking for or referring to a Hadith.

YOUR JOB IS ONLY TO:
1. Extract the core semantic proposition / meaning (strip conversational fillers, dialect wrappers, question words like "فين الحديث اللي معناه", "وش الحديث اللي يقول", "is there a hadith about", etc.).
2. Generate 3 to 6 concise Arabic search queries (1 to 5 words each) representing:
   - The core proposition / keywords
   - Likely semantic synonyms
   - Canonical phrasing candidates that express this meaning

DO NOT write the Hadith answer or text from memory.
DO NOT provide religious rulings.

USER INPUT:
${JSON.stringify(clean)}

Return JSON ONLY:
{
  "semanticMeaning": "concise description of the intended meaning / proposition in Arabic",
  "queries": ["query1", "query2", "query3", "query4"]
}`;

  const aiResult = await generateSemanticJson(prompt, { maxGeminiRetries: 2, initialBackoffMs: 500 });
  if (aiResult.ok && aiResult.json) {
    const rawQueries = Array.isArray(aiResult.json.queries) ? aiResult.json.queries : [];
    const validQueries = rawQueries
      .map((q: any) => String(q || '').trim())
      .filter((q: string) => q.length >= 2 && q.length <= 80);

    const semanticMeaning = String(aiResult.json.semanticMeaning || clean).trim();

    if (validQueries.length > 0) {
      return {
        semanticMeaning,
        queries: Array.from(new Set(validQueries)).slice(0, 6) as string[],
        providerUsed: aiResult.providerUsed,
        fallbackUsed: aiResult.fallbackUsed
      };
    }
  }

  const local = localFallbackHadithQueries(clean);
  return {
    semanticMeaning: local.semanticMeaning,
    queries: local.queries,
    providerUsed: 'local_fallback',
    fallbackUsed: true
  };
}

/**
 * Conservative local fallback for semantic relation classification.
 */
function localFallbackSemanticRelation(
  userMeaning: string,
  title: string,
  text: string
): HadithRelationResult {
  const normUser = userMeaning
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .trim();
  const normTitle = title.toLowerCase().replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ');
  const normText = text.toLowerCase().replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ');

  if (normUser.length >= 6 && (normTitle.includes(normUser) || normText.includes(normUser))) {
    return {
      relation: 'DIRECT_MATCH',
      confidence: 1.0,
      reasoning: 'مطابقة نصية مباشرة للعبارة في عنوان أو متن الحديث محلياً.',
      providerUsed: 'local_fallback',
      fallbackUsed: true
    };
  }

  const tokens = normUser.split(/\s+/).filter((w) => w.length > 2);
  if (!tokens.length) {
    return {
      relation: 'AMBIGUOUS',
      confidence: 0.3,
      reasoning: 'تعذر استخلاص كلمات مفتاحية كافية محلياً.',
      providerUsed: 'local_fallback',
      fallbackUsed: true
    };
  }

  const inTitle = tokens.filter((t) => normTitle.includes(t)).length;
  const inText = tokens.filter((t) => normText.includes(t)).length;
  const maxMatched = Math.max(inTitle, inText);
  const ratio = maxMatched / tokens.length;

  if (ratio >= 0.75) {
    return {
      relation: 'STRONG_PARAPHRASE',
      confidence: ratio,
      reasoning: 'تطابق نسبة عالية من الكلمات المفتاحية في المتن أو العنوان محلياً.',
      providerUsed: 'local_fallback',
      fallbackUsed: true
    };
  }

  if (ratio >= 0.40) {
    return {
      relation: 'PARTIAL_RELATION',
      confidence: ratio,
      reasoning: 'تطابق جزئي للكلمات دون تطابق كافٍ مع صلب موضوع الحديث.',
      providerUsed: 'local_fallback',
      fallbackUsed: true
    };
  }

  return {
    relation: 'UNRELATED',
    confidence: 0.1,
    reasoning: 'لا يوجد تطابق معنوي أو لفظي كافٍ في عنوان أو متن الحديث.',
    providerUsed: 'local_fallback',
    fallbackUsed: true
  };
}

/**
 * Classifies semantic entailment/relation between user meaning and a candidate Hadith.
 * Allowed labels: DIRECT_MATCH | STRONG_PARAPHRASE | PARTIAL_RELATION | UNRELATED | AMBIGUOUS.
 * Only DIRECT_MATCH or STRONG_PARAPHRASE may be accepted.
 */
export async function classifyHadithSemanticRelation(
  userMeaning: string,
  candidate: {
    id: string | number;
    title?: string;
    text?: string;
    explanation?: string;
  }
): Promise<HadithRelationResult> {
  const title = String(candidate.title || '').trim();
  const text = String(candidate.text || '').trim();
  const explanation = String(candidate.explanation || '').trim();

  const prompt = `You are MIHAK's Semantic Entailment & Relation Classifier.
Your task is to compare:
A) The USER'S INTENDED MEANING / QUESTION
B) A candidate Hadith from the HadeethEnc encyclopedia (title, text, explanation)

Determine how the candidate Hadith relates to what the user asked:

RELATION LABELS:
- "DIRECT_MATCH": The Hadith text or title directly and specifically expresses the exact concept/statement the user asked about.
- "STRONG_PARAPHRASE": The Hadith text or authentic meaning is a clear, unambiguous paraphrase or equivalent of the user's question/topic.
- "PARTIAL_RELATION": The Hadith shares a general theme or peripheral words (e.g., both mention "عمل" or "نية" or "حسد"), but the Hadith's central message is DIFFERENT from the user's specific inquiry.
- "UNRELATED": The Hadith does not address or answer the user's question at all.
- "AMBIGUOUS": It is unclear or doubtful whether the Hadith represents the user's intended meaning.

CRITICAL INSTRUCTIONS:
- You are strictly an evaluator of semantic correspondence.
- NEVER invent evidence, do not quote hadiths from memory, do not answer the question.
- If a Hadith merely happens to contain a word in its commentary but is actually about another topic, it is PARTIAL_RELATION or UNRELATED.
- Only mark DIRECT_MATCH or STRONG_PARAPHRASE if the candidate genuinely corresponds to the user's intended meaning.

USER INTENDED MEANING / QUERY:
${JSON.stringify(userMeaning)}

CANDIDATE HADITH RECORD:
Title: ${JSON.stringify(title)}
Hadith Text: ${JSON.stringify(text.slice(0, 500))}
Explanation: ${JSON.stringify(explanation.slice(0, 400))}

Return JSON ONLY:
{
  "relation": "DIRECT_MATCH" | "STRONG_PARAPHRASE" | "PARTIAL_RELATION" | "UNRELATED" | "AMBIGUOUS",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief 1-sentence reason"
}`;

  const aiResult = await generateSemanticJson(prompt, { maxGeminiRetries: 2, initialBackoffMs: 500 });
  if (aiResult.ok && aiResult.json) {
    const rawRel = String(aiResult.json.relation || '').trim().toUpperCase();
    const validLabels: HadithRelationLabel[] = [
      'DIRECT_MATCH', 'STRONG_PARAPHRASE', 'PARTIAL_RELATION', 'UNRELATED', 'AMBIGUOUS'
    ];
    const relation: HadithRelationLabel = validLabels.includes(rawRel as HadithRelationLabel)
      ? (rawRel as HadithRelationLabel)
      : 'AMBIGUOUS';

    const confidence = typeof aiResult.json.confidence === 'number'
      ? Math.max(0, Math.min(1, aiResult.json.confidence))
      : 0.7;

    return {
      relation,
      confidence,
      reasoning: String(aiResult.json.reasoning || ''),
      providerUsed: aiResult.providerUsed,
      fallbackUsed: aiResult.fallbackUsed
    };
  }

  return localFallbackSemanticRelation(userMeaning, title, text);
}
