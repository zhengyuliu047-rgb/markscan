export const PRIORITY_KEYWORDS = ["team", "plus", "日抛"];
export const GLOBAL_EXCLUDE_KEYWORDS = [
  "非日抛",
  "非 日抛",
  "不是日抛",
  "非小时抛",
  "非小时",
];
export const PRIMARY_EXCLUDE_KEYWORDS = [
  "接码",
  "验证码",
  "短信",
  "换绑",
  "代收",
  "虚拟卡",
  "礼品卡",
  "兑换码",
  "cdk",
  "充值",
  "直充",
  "代充",
  "代冲",
  "订阅",
  "月卡",
  "年卡",
  "教程",
  "free",
  "api",
  "ios",
  "pix",
  "土区",
  "凭证",
  "api 中转",
  "api中转",
  "中转站",
  "镜像站",
  "接口",
  "tokens",
  "token",
  "密钥",
  "key",
  "接过码",
];

function normalizeText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function getSearchText(values: Array<string | null | undefined>) {
  return normalizeText(values.filter(Boolean).join(" "));
}

export function isExcludedProduct(...values: Array<string | null | undefined>) {
  const allText = getSearchText(values);
  if (!allText) return false;
  if (GLOBAL_EXCLUDE_KEYWORDS.some((keyword) => allText.includes(normalizeText(keyword)))) return true;

  const [title, _description, ...primaryValues] = values;
  const primaryText = getSearchText([title, ...primaryValues]);
  return PRIMARY_EXCLUDE_KEYWORDS.some((keyword) => primaryText.includes(normalizeText(keyword)));
}

export function getPriorityScore(...values: Array<string | null | undefined>) {
  if (isExcludedProduct(...values)) return 0;
  const text = getSearchText(values);
  if (!text) return 0;

  return PRIORITY_KEYWORDS.reduce((score, keyword, index) => {
    return text.includes(normalizeText(keyword)) ? score + (PRIORITY_KEYWORDS.length - index) : score;
  }, 0);
}

export function matchesPriorityKeywords(...values: Array<string | null | undefined>) {
  return getPriorityScore(...values) > 0;
}

export function getPriorityLabel(...values: Array<string | null | undefined>) {
  if (isExcludedProduct(...values)) return "";
  const text = getSearchText(values);
  return PRIORITY_KEYWORDS.filter((keyword) => text.includes(normalizeText(keyword))).join(" / ");
}
