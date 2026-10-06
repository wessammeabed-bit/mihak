import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const MAX_EXTRACTED_TEXT_CHARS = 120_000;

export type ExtractedDocumentText = {
  title: string;
  text: string;
  characterCount: number;
  wordCount: number;
  extractionMethod: string;
  rawHtmlLength?: number;
  cleanBodyLength?: number;
};

export class ContentExtractionError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 422, code = 'CONTENT_EXTRACTION_ERROR') {
    super(message);
    this.name = 'ContentExtractionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeExtractedText(value: string): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ \u00A0\u2000-\u200B]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

function safeUrlTitle(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname;
  } catch {
    return 'محتوى خارجي';
  }
}

function countIslamicCues(text: string): number {
  const v = text.toLowerCase();
  const cues = [
    'القرآن', 'القران', 'سورة', 'سوره', 'آية', 'اية', 'حديث', 'النبي', 'رسول الله',
    'محمد', 'تفسير', 'قال تعالى', 'قال الله', 'مسلم', 'البخاري', 'مصحف', 'أحاديث',
    'quran', "qur'an", 'qur’an', 'koran', 'surah', 'sura', 'verse', 'ayah', 'hadith',
    'muhammad', 'mohammed', 'allah', 'muslim', 'bukhari', 'tafsir', 'islam', 'islamic'
  ];

  let count = 0;
  for (const c of cues) {
    if (v.includes(c)) count += 1;
  }
  if (/\b\d{1,3}\s*:\s*\d{1,3}\b/.test(v)) count += 2;
  return count;
}

type Candidate = {
  name: string;
  text: string;
  charCount: number;
  wordCount: number;
  linkDensity: number;
  paragraphCount: number;
  cueCount: number;
  score: number;
};

function extractElementTextWithLineBreaks($: any, el: any): { text: string; linkDensity: number } {
  if (!el || !el.length) return { text: '', linkDensity: 0 };

  const clone = el.clone();

  // Convert line breaks and blocks into newlines
  clone.find('br, hr').replaceWith('\n');
  clone.find(
    'p, div, section, article, main, li, tr, td, th, blockquote, h1, h2, h3, h4, h5, h6, dd, dt, figcaption, header, footer'
  ).each((_: any, node: any) => {
    $(node).append('\n');
  });

  const totalText = normalizeExtractedText(clone.text());
  const linkText = normalizeExtractedText(clone.find('a').text());

  const linkDensity = totalText.length > 0 ? linkText.length / totalText.length : 0;
  return { text: totalText, linkDensity };
}

export function extractHtmlDocument(html: string, sourceUrl: string): ExtractedDocumentText {
  let cheerio: any;
  try {
    cheerio = require('cheerio');
  } catch {
    throw new ContentExtractionError(
      'مكتبة cheerio غير مثبتة في الخادم.',
      500,
      'CHEERIO_NOT_INSTALLED'
    );
  }

  const rawHtml = String(html || '');
  const rawHtmlLength = rawHtml.length;

  const $ = cheerio.load(rawHtml);

  // 1. Title Extraction
  const title = normalizeExtractedText(
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').first().text() ||
    $('h1').first().text() ||
    safeUrlTitle(sourceUrl)
  ).slice(0, 300);

  // 2. Remove script, style, and interactive junk
  $('script, style, noscript, template, svg, canvas, iframe, form, button, input, select, textarea, dialog, [aria-modal="true"]').remove();

  // Remove common cookie consent / GDPR banners
  $('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i]').remove();

  const candidates: Candidate[] = [];

  // Helper to register candidate
  const addCandidate = (name: string, el: any) => {
    if (!el || !el.length) return;
    const { text, linkDensity } = extractElementTextWithLineBreaks($, el);
    const charCount = text.length;
    if (charCount < 50) return;

    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length >= 40);
    const paragraphCount = lines.length;
    const cueCount = countIslamicCues(text);

    // Scoring formula: prioritize substantive text, low link-density, good paragraphs, religious cues
    let score = Math.min(charCount, 50_000);

    // Heavily penalize navigation menus and link farms
    if (linkDensity > 0.5) {
      score *= 0.05;
    } else if (linkDensity > 0.35) {
      score *= 0.3;
    } else if (linkDensity > 0.2) {
      score *= 0.75;
    }

    score += Math.min(paragraphCount * 40, 3000);
    score += Math.min(cueCount * 120, 4000);

    candidates.push({
      name,
      text,
      charCount,
      wordCount,
      linkDensity,
      paragraphCount,
      cueCount,
      score
    });
  };

  // Candidate A: Article elements
  $('article').each((index: number, el: any) => {
    addCandidate(`article[${index}]`, $(el));
  });
  if ($('article').length > 1) {
    addCandidate('all-articles-combined', $('article'));
  }

  // Candidate B: Main elements
  $('main, [role="main"]').each((index: number, el: any) => {
    addCandidate(`main[${index}]`, $(el));
  });

  // Candidate C: Common article/content containers (ID or Class)
  const commonSelectors = [
    '#content', '.content',
    '#main-content', '.main-content',
    '#main', '.main',
    '#article', '.article',
    '.entry-content', '.post-content', '.article-content',
    '.story-body', '.article-body',
    '#story', '.story',
    '#page-content', '.page-content',
    '.body-content', '#body-content',
    '.td-post-content', '#mw-content-text',
    '.text', '#text',
    '.field-item', '.entry', '#entry'
  ];

  for (const sel of commonSelectors) {
    $(sel).each((idx: number, el: any) => {
      addCandidate(`${sel}[${idx}]`, $(el));
    });
  }

  // Candidate D: Legacy table cells or tables (extremely common in 1990s-2010s HTML)
  $('table, td').each((idx: number, el: any) => {
    const rawLen = $(el).text().length;
    // Only examine tables/cells with substantial text
    if (rawLen >= 300 && rawLen <= 80_000) {
      addCandidate(`legacy-table-or-td[${idx}]`, $(el));
    }
  });

  // Candidate E: Cleaned Body without navigational elements
  const bodyCloneWithoutNav = $('body').clone();
  bodyCloneWithoutNav.find('nav, [role="navigation"], footer, [role="contentinfo"], aside, header:not(:has(h1))').remove();
  addCandidate('cleaned-body-no-nav', bodyCloneWithoutNav);

  // Candidate F: Full Cleaned Body
  const fullBodyClone = $('body').clone();
  addCandidate('full-cleaned-body', fullBodyClone);

  // Candidate G: Semantic blocks accumulator
  const blocks: string[] = [];
  const seen = new Set<string>();
  $('body').find('h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt,td,th').each((_: any, el: any) => {
    const t = normalizeExtractedText($(el).text());
    if (t.length < 5) return;
    const key = t.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push(t);
  });
  if (blocks.length > 0) {
    const semanticAccumulated = normalizeExtractedText(blocks.join('\n\n'));
    if (semanticAccumulated.length >= 50) {
      const words = semanticAccumulated.split(/\s+/).filter(Boolean);
      candidates.push({
        name: 'semantic-blocks-accumulator',
        text: semanticAccumulated,
        charCount: semanticAccumulated.length,
        wordCount: words.length,
        linkDensity: 0.05,
        paragraphCount: blocks.filter((b) => b.length >= 40).length,
        cueCount: countIslamicCues(semanticAccumulated),
        score: Math.min(semanticAccumulated.length, 50_000) + Math.min(blocks.length * 30, 2000)
      });
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Find candidate for fallback comparison: cleaned-body-no-nav or full-cleaned-body
  const bodyCandidate = candidates.find((c) => c.name === 'cleaned-body-no-nav') ||
    candidates.find((c) => c.name === 'full-cleaned-body');

  let chosen: Candidate | undefined = candidates[0];

  // ANTI-TRUNCATION RULE:
  // If the top scored candidate has < 450 characters (like a 221 char sidebar article),
  // but a body candidate exists with > 1200 characters and reasonable link density (< 0.35),
  // NEVER lock into the tiny candidate! Prefer the richer body candidate.
  if (
    chosen &&
    bodyCandidate &&
    chosen.charCount < 600 &&
    bodyCandidate.charCount >= 1000 &&
    bodyCandidate.linkDensity < 0.35
  ) {
    chosen = bodyCandidate;
  }

  // If chosen has less than 35% of the body text and body has low link density (< 0.20),
  // prefer the body candidate to ensure full article content is captured.
  if (
    chosen &&
    bodyCandidate &&
    chosen.name !== bodyCandidate.name &&
    chosen.charCount < bodyCandidate.charCount * 0.35 &&
    bodyCandidate.linkDensity < 0.22
  ) {
    chosen = bodyCandidate;
  }

  const cleanBodyLength = bodyCandidate?.charCount || chosen?.charCount || 0;

  // Check for dynamic JS SPA Shell
  if (!chosen || chosen.charCount < 80) {
    const hasSpaMarkers =
      /<div\s+[^>]*id=["'](?:root|app|__next)["']/i.test(rawHtml) ||
      /__NEXT_DATA__|window\.__INITIAL_STATE__|react-dom/i.test(rawHtml);

    if (hasSpaMarkers) {
      throw new ContentExtractionError(
        'الصفحة تعتمد على تحميل المحتوى ديناميكيًا عبر JavaScript (SPA)، ولم يتمكن المستخرج من قراءة النص الكامل تلقائيًا.',
        422,
        'JS_DYNAMIC_PAGE'
      );
    }

    throw new ContentExtractionError(
      'تم جلب الصفحة ولكن لم يُعثر على نص مقروء كافٍ للتدقيق في بنية الـ HTML.',
      422,
      'NO_MEANINGFUL_TEXT'
    );
  }

  return {
    title: title || safeUrlTitle(sourceUrl),
    text: chosen.text,
    characterCount: chosen.charCount,
    wordCount: chosen.wordCount,
    extractionMethod: chosen.name,
    rawHtmlLength,
    cleanBodyLength
  };
}

export async function extractPdfDocument(
  bytes: Buffer,
  sourceUrl: string
): Promise<ExtractedDocumentText> {
  let pdfParse: any;
  try {
    pdfParse = require('pdf-parse');
  } catch {
    throw new ContentExtractionError(
      'مكتبة pdf-parse غير مثبتة في الخادم.',
      500,
      'PDF_PARSE_NOT_INSTALLED'
    );
  }

  const parser = pdfParse?.default || pdfParse;
  let parsed: any;
  try {
    parsed = await parser(bytes);
  } catch (error: any) {
    throw new ContentExtractionError(
      `تعذر فك بنية ملف الـ PDF: ${error?.message || 'تنسيق غير سليم'}`,
      422,
      'PDF_CORRUPTED'
    );
  }

  const rawText = String(parsed?.text || '');
  const cleanText = normalizeExtractedText(rawText);

  // If text is virtually empty, it is likely a scanned PDF without text layer
  if (!cleanText || cleanText.replace(/\s+/g, '').length < 35) {
    throw new ContentExtractionError(
      'ملف الـ PDF لا يحتوي على طبقة نصوص قابلة للاستخراج (يبدو أنه مصوّر ضوئيًا/Scanned)، ويتطلب معالجة بصرية (OCR).',
      422,
      'PDF_SCANNED_IMAGE'
    );
  }

  const metadataTitle = String(
    parsed?.info?.Title || parsed?.metadata?.get?.('dc:title') || ''
  ).trim();

  const words = cleanText.split(/\s+/).filter(Boolean);

  return {
    title: normalizeExtractedText(metadataTitle || safeUrlTitle(sourceUrl)).slice(0, 300) || safeUrlTitle(sourceUrl),
    text: cleanText,
    characterCount: cleanText.length,
    wordCount: words.length,
    extractionMethod: 'pdf-text-layer'
  };
}

export function extractPlainTextDocument(
  value: string,
  sourceUrl: string
): ExtractedDocumentText {
  const clean = normalizeExtractedText(value);
  const words = clean.split(/\s+/).filter(Boolean);
  return {
    title: safeUrlTitle(sourceUrl),
    text: clean,
    characterCount: clean.length,
    wordCount: words.length,
    extractionMethod: 'plain-text'
  };
}
