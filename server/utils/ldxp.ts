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

export type LdxpGoodsInfo = LdxpGoods & {
  real_price?: number | string | null;
  status?: number;
  user?: {
    nickname?: string;
    token?: string;
    link?: string;
    description?: string;
  };
};

export type LdxpGoodsPage = {
  total: number;
  list: LdxpGoods[];
};

const DEFAULT_GOODS_TYPES = ["card", "article", "resource", "equity"];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 会话 Cookie 缓存（按 baseUrl 分组）
const sessionCookieCache = new Map<
  string,
  { cookies: string; timestamp: number }
>();
const browserSessionCache = new Map<string, Promise<BrowserSession>>();
const SESSION_CACHE_TTL_MS = 25 * 60 * 1000; // 25 分钟
const BROWSER_SESSION_TTL_MS = 25 * 60 * 1000;
const MAX_CONCURRENT_BROWSERS = 2;

// Semaphore: limit concurrent chromium.launch() calls, not session lifetime
let browserSlots = MAX_CONCURRENT_BROWSERS;
const browserQueue: Array<() => void> = [];
function acquireBrowserSlot(): Promise<void> {
  if (browserSlots > 0) { browserSlots--; return Promise.resolve(); }
  return new Promise((resolve) => browserQueue.push(resolve));
}
function releaseBrowserSlot() {
  const next = browserQueue.shift();
  if (next) { next(); } else { browserSlots++; }
}

type BrowserSession = {
  browser: any;
  context: any;
  page: any;
  timestamp: number;
};

type PostFormOptions = {
  refererPath?: string;
  sessionPath?: string;
  visitorId?: string;
};

function useBrowserCollector() {
  const value = process.env.MARKSCAN_USE_BROWSER_COLLECTOR;
  return value === "1" || value?.toLowerCase() === "true";
}

function getBrowserWaitMs() {
  const value = Number(process.env.MARKSCAN_BROWSER_WAIT_MS || 8000);
  return Number.isFinite(value) && value >= 0 ? value : 8000;
}

function isHtmlResponse(text: string) {
  const value = text.trimStart().toLowerCase();
  return value.startsWith("<html") || value.includes("<script");
}

function previewResponseBody(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * 解算 acw_sc__v2 WAF JS 挑战
 * 从返回的 HTML 中提取 arg1，按位置重排后和固定密钥 XOR 得到验证 Cookie。
 */
function solveAcwScV2(htmlBody: string): string | null {
  // 提取 arg1='...' 中的 hex 字符串
  const arg1Match = htmlBody.match(/var\s+arg1\s*=\s*'([0-9A-Fa-f]+)'/);
  if (!arg1Match?.[1]) return null;
  const arg1 = arg1Match[1];

  // 固定的位置重排表（从 WAF JS 里提取的 m 数组）
  const order = [
    15, 35, 29, 24, 33, 16, 1, 38, 10, 9, 19, 31, 40, 27, 22, 23,
    25, 13, 6, 11, 39, 18, 20, 8, 14, 21, 32, 26, 2, 30, 7, 4,
    17, 5, 3, 28, 34, 37, 12, 36,
  ];

  // 按 order 重排 arg1 的字符
  const reordered: string[] = new Array(order.length);
  for (let i = 0; i < arg1.length && i < order.length; i++) {
    const targetIndex = order[i];
    const value = arg1[i];
    if (targetIndex === undefined || value === undefined) continue;
    reordered[targetIndex - 1] = value;
  }
  const shuffled = reordered.join("");

  // 固定 XOR 密钥（从 WAF JS 提取的 p 变量）
  const key = "3000176000856006061501533003690027800375";

  // 逐两位 hex XOR
  let result = "";
  for (let i = 0; i < shuffled.length && i < key.length; i += 2) {
    const a = parseInt(shuffled.substring(i, i + 2), 16);
    const b = parseInt(key.substring(i, i + 2), 16);
    let hex = (a ^ b).toString(16);
    if (hex.length === 1) hex = "0" + hex;
    result += hex;
  }

  return result || null;
}

/**
 * 访问店铺主页，获取 WAF/CDN 会话 Cookie。
 * 如果响应是 JS 挑战页，则求解 acw_sc__v2 并重新请求获取真实会话 Cookie。
 */
function shopPath(token: string) {
  return `/shop/${encodeURIComponent(token)}`;
}

function itemPath(goodsKey: string) {
  return `/item/${encodeURIComponent(goodsKey)}`;
}

async function acquireSessionCookies(baseUrl: string, sessionPath: string) {
  const root = normalizeBaseUrl(baseUrl);
  const sessionUrl = `${root}${sessionPath}`;

  try {
    // 第一次请求：可能触发 JS 挑战
    const firstResponse = await fetch(sessionUrl, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 收集第一次响应的 Set-Cookie
    const firstSetCookies = firstResponse.headers.getSetCookie?.() ?? [];
    const firstCookies = firstSetCookies
      .map((h) => h.split(";")[0])
      .filter((p): p is string => p !== undefined)
      .map((p) => p.trim());

    const firstBody = await firstResponse.text();

    // 检查是否是 JS 挑战页
    const acwScV2 = solveAcwScV2(firstBody);
    if (acwScV2) {
      // 计算出验证 Cookie，带上所有已收集的 Cookie 重新请求
      const challengeCookie = `acw_sc__v2=${acwScV2}`;
      const allFirstCookies = [...firstCookies, challengeCookie].join("; ");

      // 第二次请求：带上求解后的 Cookie
      const secondResponse = await fetch(sessionUrl, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
          Cookie: allFirstCookies,
          Pragma: "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1",
          "User-Agent": BROWSER_USER_AGENT,
        },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // 合并两次请求的 Cookie
      const secondSetCookies = secondResponse.headers.getSetCookie?.() ?? [];
      const secondCookies = secondSetCookies
        .map((h) => h.split(";")[0])
        .filter((p): p is string => p !== undefined)
        .map((p) => p.trim());

      // 合并去重
      const cookieMap = new Map<string, string>();
      for (const c of [...firstCookies, challengeCookie, ...secondCookies]) {
        const eqIdx = c.indexOf("=");
        if (eqIdx > 0) cookieMap.set(c.substring(0, eqIdx), c);
      }
      const finalCookies = [...cookieMap.values()].join("; ");

      console.log(`[ldxp] WAF challenge solved for ${root}, cookies acquired`);
      sessionCookieCache.set(root, { cookies: finalCookies, timestamp: Date.now() });
      return finalCookies;
    }

    // 没有 JS 挑战，直接用第一次的 Cookie
    if (firstCookies.length === 0) return "";
    const cookieString = firstCookies.join("; ");
    sessionCookieCache.set(root, { cookies: cookieString, timestamp: Date.now() });
    return cookieString;
  } catch (error) {
    console.warn(`[ldxp] 获取会话 Cookie 失败（${sessionUrl}）:`, error);
    return "";
  }
}

/**
 * 获取缓存的会话 Cookie，如果过期或不存在则重新获取
 */
async function getSessionCookies(baseUrl: string, sessionPath: string) {
  const root = normalizeBaseUrl(baseUrl);
  const cached = sessionCookieCache.get(root);

  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL_MS) {
    return cached.cookies;
  }

  return await acquireSessionCookies(baseUrl, sessionPath);
}

async function closeBrowserSession(session: BrowserSession) {
  try {
    await session.context?.close?.();
  } catch {
    // ignore close errors
  }
  try {
    await session.browser?.close?.();
  } catch {
    // ignore close errors
  }
}

async function createBrowserSession(root: string, sessionPath: string): Promise<BrowserSession> {
  const { chromium } = await import("playwright");
  await acquireBrowserSlot();
  let browser: any;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--single-process"],
    });
  } finally {
    releaseBrowserSlot(); // release immediately after launch, not after close
  }
  const context = await browser.newContext({
    locale: "zh-CN",
    userAgent: BROWSER_USER_AGENT,
  });
  const page = await context.newPage();

  await page.goto(`${root}${sessionPath}`, {
    waitUntil: "domcontentloaded",
    timeout: REQUEST_TIMEOUT_MS * 4,
  });
  await page.waitForTimeout(getBrowserWaitMs());

  return { browser, context, page, timestamp: Date.now() };
}

async function getBrowserSession(root: string, sessionPath: string) {
  const key = `${root}|${sessionPath}`;
  const cachedPromise = browserSessionCache.get(key);

  if (cachedPromise) {
    const cached = await cachedPromise;
    const isExpired = Date.now() - cached.timestamp >= BROWSER_SESSION_TTL_MS;
    const isClosed = Boolean(cached.page?.isClosed?.());
    if (!isExpired && !isClosed) return cached;
    browserSessionCache.delete(key);
    await closeBrowserSession(cached);
  }

  const sessionPromise = createBrowserSession(root, sessionPath).catch((error) => {
    browserSessionCache.delete(key);
    throw error;
  });
  browserSessionCache.set(key, sessionPromise);
  return await sessionPromise;
}

async function browserPostForm<T>(
  baseUrl: string,
  path: string,
  token: string,
  data: Record<string, string | number | null | undefined>,
  options: PostFormOptions = {},
) {
  const root = normalizeBaseUrl(baseUrl);
  const session = await getBrowserSession(root, options.sessionPath ?? shopPath(token));
  const result = await session.page.evaluate(
    async (input: { path: string; data: Record<string, string | number | null | undefined>; timeoutMs: number }) => {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(input.data)) {
        body.set(key, value === null || value === undefined ? "" : String(value));
      }

      const response = await fetch(input.path, {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(input.timeoutMs),
      });

      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type"),
        text: await response.text(),
      };
    },
    { path, data, timeoutMs: REQUEST_TIMEOUT_MS }
  );

  if (!result.ok) throw new Error(`HTTP ${result.status} for ${root}${path}: ${previewResponseBody(result.text)}`);

  let payload: LdxpApiResponse<T>;
  try {
    payload = JSON.parse(result.text) as LdxpApiResponse<T>;
  } catch {
    throw new Error(`浏览器采集仍未返回 JSON：${root}${path}，响应：${previewResponseBody(result.text)}`);
  }

  if (Number(payload.code) !== 1) throw new Error(payload.msg || `request failed for ${path}`);
  console.log(`[ldxp] browser collector fetched ${root}${path}`);
  return payload.data;
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
  options: PostFormOptions = {},
) {
  const root = normalizeBaseUrl(baseUrl);
  const body = new URLSearchParams();
  const sessionPath = options.sessionPath ?? shopPath(token);
  const refererPath = options.refererPath ?? sessionPath;

  for (const [key, value] of Object.entries(data)) {
    body.set(key, value === null || value === undefined ? "" : String(value));
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // 首次请求或缓存过期时，先获取会话 Cookie
      const sessionCookies = await getSessionCookies(baseUrl, sessionPath);

      const headers: Record<string, string> = {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: root,
        Referer: `${root}${refererPath}`,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "User-Agent": BROWSER_USER_AGENT,
        Visitorid: `markscan-${options.visitorId ?? token}`,
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
        // 如果收到 HTML（WAF 拦截），清除 Cookie 缓存，下次重试会重新获取
        if (isHtmlResponse(responseText)) {
          if (useBrowserCollector()) {
            console.log(`[ldxp] fallback to browser collector for ${root}${path}`);
            return await browserPostForm<T>(baseUrl, path, token, data, options);
          }
          sessionCookieCache.delete(root);
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          throw new Error(
            `店铺接口返回 HTML 而非 JSON，WAF 挑战求解后仍被拦截。` +
            `完整路径：${root}${path}，响应：${previewResponseBody(responseText)}`
          );
        }
        throw new Error(`店铺接口没有返回 JSON：${root}${path}，响应：${previewResponseBody(responseText)}`);
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

export function fetchGoodsInfo(baseUrl: string, goodsKey: string, sessionToken?: string) {
  return postForm<LdxpGoodsInfo>(baseUrl, "/shopApi/Shop/goodsInfo", goodsKey, { goods_key: goodsKey, trade_no: "" }, {
    refererPath: itemPath(goodsKey),
    sessionPath: sessionToken ? shopPath(sessionToken) : itemPath(goodsKey),
    visitorId: sessionToken ?? `item-${goodsKey}`,
  });
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
