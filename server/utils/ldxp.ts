export type LdxpApiResponse<T> = {
  code: number;
  msg: string;
  time?: number;
  data: T;
};

export type LdxpShopInfo = {
  link: string;
  nickname: string;
  token: string;
  sell_count?: number;
  goods_count?: number;
  goods_type_sort?: string[];
};

export type LdxpCategory = {
  id: number;
  name: string;
  image?: string;
  goods_count?: number;
};

export type LdxpGoods = {
  link: string;
  goods_type: string;
  goods_key: string;
  name: string;
  price: number | string | null;
  market_price: number | string | null;
  description?: string;
  image?: string;
  category?: { id: number; name: string };
  extend?: {
    stock_count?: number | string | null;
    show_stock_type?: number;
    send_order?: number;
    limit_count?: number;
  };
};

export type LdxpGoodsPage = {
  total: number;
  list: LdxpGoods[];
};

const DEFAULT_GOODS_TYPES = ["card", "article", "resource", "equity"];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function normalizeGoodsTypes(goodsTypes?: string[] | null) {
  const values = goodsTypes?.filter(Boolean) ?? [];
  return values.length > 0 ? values : DEFAULT_GOODS_TYPES;
}

export function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toInteger(value: unknown) {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

async function postForm<T>(
  baseUrl: string,
  path: string,
  token: string,
  data: Record<string, string | number | null | undefined>,
) {
  const root = normalizeBaseUrl(baseUrl);
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(data)) {
    body.set(key, value === null || value === undefined ? "" : String(value));
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${root}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Origin: root,
          Referer: `${root}/shop/${token}`,
          "User-Agent": "Mozilla/5.0 MarkscanCollector/0.1",
          Visitorid: `markscan-${token}`,
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);

      const payload = (await response.json()) as LdxpApiResponse<T>;
      if (Number(payload.code) !== 1) throw new Error(payload.msg || `request failed for ${path}`);
      return payload.data;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function fetchShopInfo(baseUrl: string, token: string) {
  return postForm<LdxpShopInfo>(baseUrl, "/shopApi/Shop/info", token, { token, category_key: "" });
}

export function fetchCategories(baseUrl: string, token: string, goodsType: string) {
  return postForm<LdxpCategory[]>(baseUrl, "/shopApi/Shop/categoryList", token, { token, goods_type: goodsType });
}

export function fetchGoodsPage(
  baseUrl: string,
  token: string,
  input: { goodsType: string; categoryId?: string | number | null; current: number; pageSize: number },
) {
  return postForm<LdxpGoodsPage>(baseUrl, "/shopApi/Shop/goodsList", token, {
    token,
    goods_type: input.goodsType,
    category_id: input.categoryId ?? "",
    current: input.current,
    pageSize: input.pageSize,
  });
}
