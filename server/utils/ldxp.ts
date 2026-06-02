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
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 会话 Cookie 缓存（按 baseUrl 分组）
const sessionCookieCache = new Map<
  string,
  { cookies: string; timestamp: number }
>();
const SESSION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟

function previewResponseBody(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * 访问店铺主页，获取 WAF/CDN 会话 Cookie
 * 用于绕过防火墙验证（仅限已授权的防火墙测试）
 */
async function acquireSessionCookies(baseUrl: string, token: string) {
  const root = normalizeBaseUrl(baseUrl);
  const shopPageUrl = `${root}/shop/${token}`;

  try {
    const response = await fetch(shopPageUrl, {
      method: "GET",
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": BROWSER_USER_AGENT,
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 提取所有 Set-Cookie 响应头
    const setCookieHeaders = response.headers.getSetCookie?.() ?? [];
    if (setCookieHeaders.length === 0) {
      // 没有 Cookie 也不报错，可能目标站不需要或已放行
      return "";
    }

    // 解析每个 Cookie，只保留 name=value 部分
    const cookiePairs = setCookieHeaders
      .map((header) => header.split(";")[0])
      .filter((part): part is string => part !== undefined)
      .map((part) => part.trim());

    const cookieString = cookiePairs.join("; ");
    sessionCookieCache.set(root, { cookies: cookieString, timestamp: Date.now() });
    return cookieString;
  } catch (error) {
    console.warn(`[ldxp] 获取会话 Cookie 失败（${shopPageUrl}）:`, error);
    return "";
  }
}

/**
 * 获取缓存的会话 Cookie，如果过期或不存在则重新获取
 */
async function getSessionCookies(baseUrl: string, token: string) {
  const root = normalizeBaseUrl(baseUrl);
  const cached = sessionCookieCache.get(root);

  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL_MS) {
    return cached.cookies;
  }

  return await acquireSessionCookies(baseUrl, token);
}

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
      // 首次请求或缓存过期时，先获取会话 Cookie
      const sessionCookies = await getSessionCookies(baseUrl, token);

      const headers: Record<string, string> = {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: root,
        Referer: `${root}/shop/${token}`,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": BROWSER_USER_AGENT,
        Visitorid: `markscan-${token}`,
        "X-Requested-With": "XMLHttpRequest",
      };

      // 如果成功获取了会话 Cookie，附加到请求中
      if (sessionCookies) {
        headers["Cookie"] = sessionCookies;
      }

      const response = await fetch(`${root}${path}`, {
        method: "POST",
        headers,
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const responseText = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${root}${path}: ${previewResponseBody(responseText)}`);

      let payload: LdxpApiResponse<T>;
      try {
        payload = JSON.parse(responseText) as LdxpApiResponse<T>;
      } catch {
        // 如果仍然收到 HTML（可能是 WAF 拦截），清除缓存的 Cookie 并在下次重试
        if (responseText.includes("<html>") || responseText.includes("<script>")) {
          sessionCookieCache.delete(root);
          throw new Error(
            `店铺接口返回 HTML 而非 JSON，可能被防火墙拦截。请检查：1) 店铺 URL 是否正确 2) 服务器出口 IP 是否被目标站限制。` +
            `完整路径：${root}${path}，响应：${previewResponseBody(responseText)}`
          );
        }
        throw new Error(`店铺接口没有返回 JSON，请检查店铺 URL 或目标站是否有安全验证：${root}${path}，响应：${previewResponseBody(responseText)}`);
      }
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
