/* =========================================================
   MIHAK — Quran Foundation Content API Client
   Backend only. Never expose QF_CLIENT_SECRET to the browser.
   ========================================================= */

type QFEnv = 'prelive' | 'production';

type TokenCache = {
  accessToken: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

function getEnv(): QFEnv {
  const raw = String(process.env.QF_ENV || 'production').trim().toLowerCase();
  return raw === 'prelive' ? 'prelive' : 'production';
}

function getClientId(): string {
  const value = String(process.env.QF_CLIENT_ID || '').trim();
  if (!value) throw new Error('QF_CLIENT_ID is not configured.');
  return value;
}

function getClientSecret(): string {
  const value = String(process.env.QF_CLIENT_SECRET || '').trim();
  if (!value) throw new Error('QF_CLIENT_SECRET is not configured.');
  return value;
}

function getBases() {
  const env = getEnv();

  if (env === 'production') {
    return {
      env,
      authBase: 'https://oauth2.quran.foundation',
      apiBase: 'https://apis.quran.foundation'
    };
  }

  return {
    env,
    authBase: 'https://prelive-oauth2.quran.foundation',
    apiBase: 'https://apis-prelive.quran.foundation'
  };
}

async function requestToken(force = false): Promise<string> {
  const now = Date.now();

  if (!force && tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const { authBase } = getBases();

  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');

  const response = await fetch(`${authBase}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=content'
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Quran Foundation token request failed (${response.status}): ${raw}`);
  }

  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Quran Foundation token endpoint returned invalid JSON.');
  }

  const accessToken = String(data?.access_token || '').trim();
  if (!accessToken) {
    throw new Error('Quran Foundation did not return an access token.');
  }

  const expiresIn = Number(data?.expires_in || 3600);
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000
  };

  return accessToken;
}

export async function contentGet(path: string, retryOn401 = true): Promise<any> {
  const clientId = getClientId();
  const token = await requestToken();
  const { apiBase } = getBases();

  const doFetch = (authToken: string) =>
    fetch(`${apiBase}${path}`, {
      headers: {
        Accept: 'application/json',
        'x-auth-token': authToken,
        'x-client-id': clientId
      }
    });

  let response = await doFetch(token);

  if (response.status === 401 && retryOn401) {
    tokenCache = null;
    const freshToken = await requestToken(true);
    response = await doFetch(freshToken);
  }

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Quran Foundation request failed (${response.status}): ${raw}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Quran Foundation returned invalid JSON for ${path}.`);
  }
}

function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, String(value));
  }

  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

function validateVerseKey(verseKey: string): string {
  const clean = String(verseKey || '').trim();
  if (!/^\d{1,3}:\d{1,3}$/.test(clean)) {
    throw new Error('Invalid Quran verse key. Expected chapter:ayah, e.g. 2:255.');
  }
  return clean;
}

export async function qfGetVerseByKey(verseKey: string) {
  const clean = validateVerseKey(verseKey);

  return contentGet(
    withQuery('/content/api/v4/quran/verses/uthmani', {
      verse_key: clean
    })
  );
}

export async function qfGetArabicTafsirResources() {
  return contentGet(
    withQuery('/content/api/v4/resources/tafsirs', {
      language: 'ar'
    })
  );
}

export const QF_TAFSIR_MUYASSAR_ID = 16;

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Official Quran Foundation Content API endpoint for one ayah tafsir:
 * GET /content/api/v4/tafsirs/{resource_id}/by_ayah/{ayah_key}
 */
export async function qfGetTafsirByVerseKey(
  verseKey: string,
  resourceId: number = QF_TAFSIR_MUYASSAR_ID
) {
  const clean = validateVerseKey(verseKey);

  const data = await contentGet(
    withQuery(
      `/content/api/v4/tafsirs/${resourceId}/by_ayah/${encodeURIComponent(clean)}`,
      {
        fields: 'chapter_id,verse_number,verse_key,resource_name,language_name,id'
      }
    )
  );

  const record = data?.tafsir || null;
  const textHtml = String(record?.text || '').trim();

  return {
    verseKey: clean,
    resourceId: Number(record?.resource_id || resourceId),
    resourceName:
      String(record?.translated_name?.name || '').trim() ||
      String(record?.resource_name || '').trim() ||
      'التفسير الميسر',
    languageName:
      String(record?.translated_name?.language_name || '').trim() ||
      String(record?.language_name || '').trim() ||
      'Arabic',
    textHtml,
    text: stripHtml(textHtml),
    raw: data
  };
}

export async function qfGetTafsirMuyassarByVerseKey(verseKey: string) {
  return qfGetTafsirByVerseKey(verseKey, QF_TAFSIR_MUYASSAR_ID);
}

export async function qfGetAllVersesUthmani() {
  // Official docs explicitly allow blank filters to return the whole Quran.
  return contentGet('/content/api/v4/quran/verses/uthmani');
}

export async function qfGetChapters() {
  return contentGet('/content/api/v4/chapters');
}

export async function qfGetChapter(chapterNumber: number) {
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 114) {
    throw new Error('Invalid Quran chapter number.');
  }

  return contentGet(`/content/api/v4/chapters/${chapterNumber}`);
}

export async function qfSearch(
  query: string,
  page = 1,
  size = 20,
  language = 'ar'
) {
  const clean = String(query || '').trim();
  if (!clean) return { search: { results: [] } };

  return contentGet(
    withQuery('/content/api/v4/search', {
      q: clean,
      page,
      size,
      language
    })
  );
}

export async function testQuranFoundationConnection() {
  const data = await qfGetChapters();
  const chapters = Array.isArray(data?.chapters) ? data.chapters : [];

  return {
    ok: chapters.length === 114,
    environment: getEnv(),
    source: 'Quran Foundation',
    chapterCount: chapters.length,
    sample: chapters.slice(0, 3).map((chapter: any) => ({
      id: chapter?.id,
      nameArabic: chapter?.name_arabic,
      versesCount: chapter?.verses_count
    }))
  };
}

export async function testQuranFoundationContent() {
  const [verseData, tafsirData] = await Promise.all([
    qfGetVerseByKey('2:255'),
    qfGetArabicTafsirResources()
  ]);

  const verse = Array.isArray(verseData?.verses) ? verseData.verses[0] : null;
  const tafsirs = Array.isArray(tafsirData?.tafsirs) ? tafsirData.tafsirs : [];

  return {
    ok: Boolean(verse?.verse_key === '2:255' && verse?.text_uthmani),
    environment: getEnv(),
    verseTest: {
      requested: '2:255',
      verseKey: verse?.verse_key || null,
      textUthmani: verse?.text_uthmani || null
    },
    tafsirResources: {
      totalReturned: tafsirs.length,
      sample: tafsirs.slice(0, 12).map((item: any) => ({
        id: item?.id,
        name: item?.translated_name?.name || item?.name,
        slug: item?.slug,
        language: item?.translated_name?.language_name || item?.language_name
      }))
    }
  };
}

export async function testQuranFoundationVerseAndTafsir() {
  const requested = '2:255';

  const verseData = await qfGetVerseByKey(requested);
  const verse = Array.isArray(verseData?.verses) ? verseData.verses[0] : null;

  let tafsir: any = null;
  try {
    tafsir = await qfGetTafsirMuyassarByVerseKey(requested);
  } catch (error) {
    console.warn('[MIHAK] Quran Foundation tafsir test failed:', error);
  }

  return {
    ok: Boolean(
      verse?.verse_key === requested &&
      verse?.text_uthmani &&
      tafsir?.text
    ),
    environment: getEnv(),
    source: 'Quran Foundation',
    requested,
    verse: {
      verseKey: verse?.verse_key || null,
      textUthmani: verse?.text_uthmani || null
    },
    tafsir: {
      resourceId: tafsir?.resourceId || null,
      resourceName: tafsir?.resourceName || null,
      text: tafsir?.text || null
    }
  };
}
