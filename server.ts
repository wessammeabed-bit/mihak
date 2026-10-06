import express from 'express';

import path from 'path';

import dotenv from 'dotenv';

import { createServer as createViteServer } from 'vite';



import { compareTransformationWithGemini } from './src/server/geminiService';

import { centralOrchestrator } from './src/server/centralOrchestrator';

import {

  testQuranFoundationConnection,

  testQuranFoundationContent,

  testQuranFoundationVerseAndTafsir

} from './src/server/quranFoundationClient';

import { getCorpusIntegrityReport } from './src/server/quranKnowledge';

import { getHadithDatasetStatus, getHadithLiveStatus } from './src/server/hadithEngine';

import { fetchExternalContent, ExternalContentError } from './src/server/externalContentService';

import { auditExternalDocument } from './src/server/externalAuditAdapter';

import { transcribeAudio, TranscriptionError } from './src/server/transcriptionService';

import { auditMediaTranscript } from './src/server/mediaAuditAdapter';

import { searchAndAuditDiscovery } from './src/server/searchDiscoveryService';



dotenv.config();



function getPort(): number {

  const argIdx = process.argv.indexOf('--port');

  if (argIdx !== -1 && process.argv[argIdx + 1]) {

    const val = Number(process.argv[argIdx + 1]);

    if (!Number.isNaN(val) && val > 0) return val;

  }

  // In container environments, PORT=8080 is reserved for nginx reverse proxy.

  // The Node app must listen on 3000 for internal forwarding.

  if (process.env.PORT && process.env.PORT !== '8080') {

    const p = Number(process.env.PORT);

    if (!Number.isNaN(p) && p > 0) return p;

  }

  return 3000;

}



const app = express();

const PORT = getPort();



app.use(express.json({ limit: '100mb' }));

app.use(express.urlencoded({ extended: true, limit: '100mb' }));



/* =========================================================

   HEALTH & CORPUS STATUS

   ========================================================= */



app.get('/api/health', (_req, res) => {

  res.json({

    status: 'ok',

    service: 'MIHAK',

    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),

    quranFoundationConfigured: Boolean(

      process.env.QF_CLIENT_ID && process.env.QF_CLIENT_SECRET

    ),

    quranFoundationEnvironment: String(process.env.QF_ENV || 'production')

  });

});



app.get(['/api/status', '/api/corpus'], (_req, res) => {

  const integrity = getCorpusIntegrityReport();

  const hadith = getHadithDatasetStatus();



  return res.json({

    status: 'ok',

    service: 'MIHAK',

    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),

    ...integrity,

    hadithLocalIndex: hadith

  });

});



/* =========================================================

   QURAN FOUNDATION DIAGNOSTICS

   ========================================================= */



app.get('/api/quran-foundation/test', async (_req, res) => {

  try {

    return res.json(await testQuranFoundationConnection());

  } catch (error: any) {

    console.error('[MIHAK] Quran Foundation connection test failed:', error?.message || error);

    return res.status(500).json({

      ok: false,

      error: 'تعذر الاتصال بـ Quran Foundation. راجعي QF_CLIENT_ID وQF_CLIENT_SECRET وQF_ENV.'

    });

  }

});



app.get('/api/quran-foundation/content-test', async (_req, res) => {

  try {

    return res.json(await testQuranFoundationContent());

  } catch (error: any) {

    console.error('[MIHAK] Quran Foundation content test failed:', error?.message || error);

    return res.status(500).json({

      ok: false,

      error: 'تعذر اختبار نص الآية أو قائمة التفاسير من Quran Foundation.'

    });

  }

});



app.get('/api/quran-foundation/verse-tafsir-test', async (_req, res) => {

  try {

    return res.json(await testQuranFoundationVerseAndTafsir());

  } catch (error: any) {

    console.error('[MIHAK] Quran Foundation verse + tafsir test failed:', error?.message || error);

    return res.status(500).json({

      ok: false,

      error: 'تعذر جلب الآية والتفسير مباشرة من Quran Foundation.'

    });

  }

});



/* =========================================================

   HADEETHENC DIAGNOSTICS

   ========================================================= */



app.get('/api/hadeethenc/test', async (_req, res) => {

  try {

    const live = await getHadithLiveStatus();

    const local = getHadithDatasetStatus();

    return res.json({ live, local });

  } catch (error: any) {

    console.error('[MIHAK] HadeethEnc test failed:', error?.message || error);

    return res.status(500).json({

      ok: false,

      error: 'تعذر اختبار الاتصال الحي بموسوعة الأحاديث HadeethEnc.'

    });

  }

});



/* =========================================================

   AUDIT

   ========================================================= */



app.post('/api/audit', async (req, res) => {

  try {

    const rawInput = req.body?.text ?? req.body?.content ?? req.body?.input ?? req.body?.query ?? '';

    const inputPreview = String(rawInput || '').slice(0, 80);

    const inputLength = String(rawInput || '').length;



    console.log(`\n[MIHAK LIVE API]\nrevision: router-runtime-debug-v1\nroute: /api/audit\ninputLength: ${inputLength}\ninputPreview: "${inputPreview}"\n`);



    const text = String(rawInput).trim();



    const referenceSource = req.body?.referenceSource

      ? String(req.body.referenceSource).trim()

      : undefined;



    if (!text) {

      return res.status(400).json({ error: 'يرجى إدخال نص للتدقيق.' });

    }



    // Safeguard: If client posted a raw URL to /api/audit, route to external URL audit

    if (/^https?:\/\/[^\s]+$/i.test(text)) {

      console.log('[MIHAK Routing] Raw URL sent to /api/audit. Redirecting to external URL audit:', text);

      const document = await fetchExternalContent(text);

      const urlResult = await auditExternalDocument(document);

      return res.json(urlResult.audit);

    }



    console.log(`[MIHAK LIVE ORCHESTRATOR CALL]\nrevision: router-runtime-debug-v1\n`);

    const result = await centralOrchestrator(text, referenceSource);

    return res.json(result);

  } catch (error) {

    console.error('[MIHAK] /api/audit failed:', error);

    return res.status(500).json({ error: 'تعذر تنفيذ التدقيق حاليًا.' });

  }

});





/* =========================================================

   EXTERNAL URL AUDIT

   External pages are UNTRUSTED INPUT only, never evidence.

   ========================================================= */



app.post('/api/audit-url', async (req, res) => {

  try {

    const url = String(

      req.body?.url ??

      req.body?.link ??

      ''

    ).trim();



    if (!url) {

      return res.status(400).json({

        ok: false,

        error: 'يرجى إدخال رابط المحتوى المراد فحصه.'

      });

    }



    const document = await fetchExternalContent(url);

    const result = await auditExternalDocument(document);

    return res.json(result);

  } catch (error: any) {

    const statusCode = error instanceof ExternalContentError

      ? error.statusCode

      : 500;



    console.error('[MIHAK] /api/audit-url failed:', error);



    return res.status(statusCode).json({

      ok: false,

      code: error instanceof ExternalContentError ? error.code : 'URL_AUDIT_FAILED',

      error: error?.message || 'تعذر فحص الرابط الخارجي حاليًا.'

    });

  }

});



/* =========================================================

   AUDIO & VIDEO TRANSCRIPTION AUDIT

   Uses gemini-3.5-transcribe for audio transcription,

   then verifies claims against MIHAK trusted sources.

   ========================================================= */



app.post('/api/audit-audio', async (req, res) => {

  try {

    const audioBase64 = String(req.body?.audioBase64 ?? req.body?.audio ?? '').trim();

    const mimeType = String(req.body?.mimeType ?? 'audio/webm').trim();

    const fileName = req.body?.fileName ? String(req.body.fileName).trim() : undefined;



    if (!audioBase64) {

      return res.status(400).json({

        ok: false,

        error: 'يرجى إرسال تسجيل صوتي أو ملف وسائط للتدقيق.'

      });

    }



    const transcript = await transcribeAudio(audioBase64, mimeType, fileName);

    const result = await auditMediaTranscript(transcript, { fileName, mimeType: transcript.mimeType });

    return res.json(result);

  } catch (error: any) {

    const statusCode = error instanceof TranscriptionError ? error.statusCode : 500;

    console.error('[MIHAK] /api/audit-audio failed:', error?.message || error);

    let userMsg = error?.message || 'تعذر تفريغ وتدقيق المقطع الصوتي حاليًا.';

    if (userMsg.includes('base64') || userMsg.includes('data:') || userMsg.length > 250) {

      userMsg = 'تعذر تفريغ المقطع. يرجى التأكد من وضوح الصوت وصيغة الملف والمحاولة مرة أخرى.';

    }

    return res.status(statusCode).json({

      ok: false,

      code: error instanceof TranscriptionError ? error.code : 'AUDIO_AUDIT_FAILED',

      error: userMsg

    });

  }

});



/* =========================================================

   GOOGLE SEARCH GROUNDING & DISCOVERY

   Uses gemini-3.5-flash with googleSearch tool for

   external web context & claim discovery, then verifies

   religious claims against MIHAK trusted corpora.

   ========================================================= */



app.post('/api/search-discovery', async (req, res) => {

  try {

    const query = String(req.body?.query ?? req.body?.q ?? '').trim();

    if (!query) {

      return res.status(400).json({

        ok: false,

        error: 'يرجى إدخال استعلام للبحث والاستكشاف.'

      });

    }



    // Safeguard: Never send a raw URL to Google Search!

    if (/^https?:\/\/[^\s]+$/i.test(query)) {

      console.log('[MIHAK Routing] Raw URL passed to /api/search-discovery. Routing to URL audit:', query);

      const document = await fetchExternalContent(query);

      const urlResult = await auditExternalDocument(document);

      return res.json({

        ok: true,

        query,

        contextSummary: `تم استيراد وفحص محتوى الرابط مباشرة (${document.title || document.hostname}) بدلاً من البحث عن نص الرابط في الويب.`,

        sources: [{

          title: document.title || document.hostname,

          url: document.finalUrl,

          sourceRole: 'EXTERNAL_CONTEXT'

        }],

        claims: urlResult.audit.claims,

        audit: urlResult.audit,

        notice: 'تم فحص محتوى الصفحة الأصلي مباشرة عبر محرك تدقيق الروابط.'

      });

    }



    const result = await searchAndAuditDiscovery(query);

    return res.json(result);

  } catch (error: any) {

    console.error('[MIHAK] /api/search-discovery failed:', error);

    return res.status(500).json({

      ok: false,

      error: error?.message || 'تعذر إتمام البحث والاستكشاف حاليًا.'

    });

  }

});



/* =========================================================

   COMPARE

   ========================================================= */



app.post('/api/compare', async (req, res) => {

  try {

    const sourceText = String(

      req.body?.sourceText ??

      req.body?.source_text ??

      req.body?.source ??

      ''

    ).trim();



    const derivedText = String(

      req.body?.derivedText ??

      req.body?.derived_text ??

      req.body?.derived ??

      ''

    ).trim();



    const derivedType = String(

      req.body?.derivedType ??

      req.body?.derived_type ??

      req.body?.type ??

      'paraphrase'

    ).trim();



    if (!sourceText || !derivedText) {

      return res.status(400).json({

        error: 'يلزم إدخال النص المصدر والنص المشتق للمقارنة.'

      });

    }



    const result = await compareTransformationWithGemini(

      sourceText,

      derivedText,

      derivedType

    );



    return res.json(result);

  } catch (error) {

    console.error('[MIHAK] /api/compare failed:', error);

    return res.status(500).json({ error: 'تعذر تنفيذ المقارنة حاليًا.' });

  }

});



/* =========================================================

   START SERVER + VITE

   ========================================================= */



async function startServer() {

  if (process.env.NODE_ENV !== 'production') {

    const vite = await createViteServer({

      server: { middlewareMode: true },

      appType: 'spa'

    });



    app.use(vite.middlewares);

  } else {

    const distPath = path.join(process.cwd(), 'dist');

    app.use(express.static(distPath));



    app.use((_req, res) => {

      res.sendFile(path.join(distPath, 'index.html'));

    });

  }



  app.listen(PORT, '0.0.0.0', () => {

    console.log(`Server started on port ${PORT}.`);

  });

}



startServer().catch((error) => {

  console.error('[MIHAK] Server failed to start:', error);

  process.exit(1);

});
