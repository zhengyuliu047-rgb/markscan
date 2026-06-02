export const SHOP_CHANNELS = ["ldxp", "catfk"] as const;

export type ShopChannel = (typeof SHOP_CHANNELS)[number];

export function isShopChannel(value: string): value is ShopChannel {
  return SHOP_CHANNELS.includes(value as ShopChannel);
}

export function inferChannelFromBaseUrl(baseUrl: string): ShopChannel {
  const host = new URL(baseUrl).hostname.toLowerCase();
  if (host.includes("catfk.com")) return "catfk";
  return "ldxp";
}

export function parseShopUrl(rawUrl: string) {
  const url = new URL(rawUrl.trim());
  const match = url.pathname.match(/\/(?:shop|item)\/([^/?#]+)/i);
  if (!match?.[1]) {
    throw new Error("店铺 URL 格式应类似 https://domain/shop/TOKEN 或 https://domain/item/TOKEN");
  }

  return {
    baseUrl: `${url.protocol}//${url.host}`,
    token: match[1],
    channel: inferChannelFromBaseUrl(`${url.protocol}//${url.host}`),
  };
}
