/* =========================================================
   MIHAK — HadeethEnc Live API Client
   Backend only. Uses the public HadeethEnc v1 API.
   ========================================================= */

const BASE_URL = 'https://hadeethenc.com/api/v1';
const DEFAULT_TIMEOUT_MS = 12_000;

export type HadeethEncWordMeaning = {
  word?: string;
  meaning?: string;
};

export type HadeethEncRecord = {
  id: string;
  title?: string;
  hadeeth?: string;
  attribution?: string;
  grade?: string;
  explanation?: string;
  hints?: string[];
  categories?: string[];
  translations?: string[];
  hadeeth_intro?: string;
  words_meanings?: HadeethEncWordMeaning[];
  reference?: string;
  [key: string]: any;
};

export type HadeethEncListResponse = {
  data?: Array<{
    id: string;
    title?: string;
    translations?: string[];
  }>;
  meta?: {
    current_page?: string | number;
    last_page?: string | number;
    total_items?: string | number;
    per_page?: string | number;
  };
};

async function getJson(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(`HadeethEnc request failed (${response.status}): ${raw}`);
    }

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`HadeethEnc returned invalid JSON for ${path}.`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    q.set(key, String(value));
  }
  return q.toString();
}

export async function hadeethEncGetLanguages() {
  return getJson('/languages');
}

export async function hadeethEncGetRootCategories(language = 'ar') {
  return getJson(`/categories/roots/?${query({ language })}`);
}

export async function hadeethEncGetCategories(language = 'ar') {
  return getJson(`/categories/list/?${query({ language })}`);
}

export async function hadeethEncGetHadithList(
  categoryId: string | number,
  page = 1,
  perPage = 20,
  language = 'ar'
): Promise<HadeethEncListResponse> {
  return getJson(
    `/hadeeths/list/?${query({
      language,
      category_id: categoryId,
      page,
      per_page: Math.max(1, Math.min(100, perPage))
    })}`
  );
}

export async function hadeethEncGetHadithById(
  id: string | number,
  language = 'ar'
): Promise<HadeethEncRecord> {
  const cleanId = String(id || '').trim();
  if (!cleanId) throw new Error('Hadith id is required.');

  const data = await getJson(
    `/hadeeths/one/?${query({ language, id: cleanId })}`
  );

  if (!data?.id) {
    throw new Error(`HadeethEnc returned no record for id ${cleanId}.`);
  }

  return data as HadeethEncRecord;
}

export function hadeethEncWordMeaningsToText(
  meanings: HadeethEncWordMeaning[] | undefined
): string {
  if (!Array.isArray(meanings)) return '';

  return meanings
    .map((item) => {
      const word = String(item?.word || '').trim();
      const meaning = String(item?.meaning || '').trim();
      if (!word && !meaning) return '';
      return word ? `${word}: ${meaning}` : meaning;
    })
    .filter(Boolean)
    .join('\n');
}

export async function testHadeethEncConnection() {
  const [languages, roots] = await Promise.all([
    hadeethEncGetLanguages(),
    hadeethEncGetRootCategories('ar')
  ]);

  const arabic = Array.isArray(languages)
    ? languages.some((item: any) => item?.code === 'ar')
    : false;

  return {
    ok: arabic && Array.isArray(roots) && roots.length > 0,
    source: 'HadeethEnc Live API',
    baseUrl: BASE_URL,
    arabicAvailable: arabic,
    rootCategories: Array.isArray(roots) ? roots.length : 0
  };
}
