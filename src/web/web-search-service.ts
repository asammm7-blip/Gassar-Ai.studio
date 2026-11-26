export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(query: string): Promise<WebSearchResult[]> {
  const cleanQuery = query.replace(/\n?\[وضع الويب مفعّل[^\]]*\]/g, '').trim().slice(0, 500);
  if (!cleanQuery) throw new Error('لا يمكن إجراء بحث ويب دون سؤال واضح.');
  const response = await fetch(`/api/web-search?q=${encodeURIComponent(cleanQuery)}`);
  const data = (await response.json()) as { results?: WebSearchResult[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error || `فشل البحث الويب (${response.status})`);
  }
  return data.results ?? [];
}

export function formatWebContext(results: WebSearchResult[]): string {
  if (!results.length) {
    return '\n\n[نتيجة البحث الويب: لم يعثر محرك البحث على مصادر مباشرة. أجب بوضوح ولا تخترع مصادر.]';
  }
  return `\n\n[مصادر بحث ويب حديثة — استخدمها للتحقق، واذكر الروابط عند الحاجة]\n${results
    .map((result, index) => `${index + 1}. ${result.title}\n${result.snippet}\nالرابط: ${result.url}`)
    .join('\n\n')}\n[/مصادر بحث الويب]`;
}
