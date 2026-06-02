export const PRIORITY_KEYWORDS = ["team", "plus", "日抛"];

function normalizeText(value: string) {
  return value.toLowerCase();
}

export function getPriorityScore(...values: Array<string | null | undefined>) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  if (!text) return 0;

  return PRIORITY_KEYWORDS.reduce((score, keyword, index) => {
    return text.includes(normalizeText(keyword)) ? score + (PRIORITY_KEYWORDS.length - index) : score;
  }, 0);
}

export function matchesPriorityKeywords(...values: Array<string | null | undefined>) {
  return getPriorityScore(...values) > 0;
}

export function getPriorityLabel(...values: Array<string | null | undefined>) {
  const text = normalizeText(values.filter(Boolean).join(" "));
  return PRIORITY_KEYWORDS.filter((keyword) => text.includes(normalizeText(keyword))).join(" / ");
}
