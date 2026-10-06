export type DorarResult = {
  rawHtml: string;
  plainText: string;
};

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function searchDorar(
  query: string,
  timeoutMs = 7000
): Promise<DorarResult[]> {
  const clean = String(query || '').trim();

  if (!clean) return [];

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const url =
      `https://dorar.net/dorar_api.json?skey=${encodeURIComponent(clean)}`;

    const response = await fetch(url, {
  method: 'GET',
  headers: {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
    Referer: 'https://dorar.net/',
    'Accept-Language': 'ar,en;q=0.9'
  },
  signal: controller.signal
});

    if (!response.ok) {
      console.warn(
        `[MIHAK Dorar] HTTP ${response.status} for query: ${clean}`
      );
      return [];
    }

    const data = await response.json();

    const items = Array.isArray(data?.ahadith)
      ? data.ahadith
      : [];

    return items
      .map((item: any) => {
        const rawHtml = String(item?.th || '').trim();

        return {
          rawHtml,
          plainText: stripHtml(rawHtml)
        };
      })
      .filter(
        (item: DorarResult) =>
          item.rawHtml.length > 0 &&
          item.plainText.length > 0
      );

  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn(
        `[MIHAK Dorar] Request timed out for query: ${clean}`
      );
    } else {
      console.warn(
        '[MIHAK Dorar] Search failed:',
        error
      );
    }

    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function testDorarConnection(): Promise<{
  ok: boolean;
  count: number;
  sample?: string;
  error?: string;
}> {
  try {
    const results = await searchDorar('إنما الأعمال بالنيات', 7000);

    return {
      ok: results.length > 0,
      count: results.length,
      sample: results[0]?.plainText
    };
  } catch (error: any) {
    return {
      ok: false,
      count: 0,
      error: String(error?.message || error)
    };
  }
}