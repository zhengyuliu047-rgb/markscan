import db from "../../utils/db";
import { requireAdmin } from "../../utils/auth";
import { inferChannelFromBaseUrl, isShopChannel, parseShopUrl } from "../../utils/shops";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const body = await readBody<{
    shopUrl?: string;
    channel?: string;
    name?: string;
    token?: string;
    baseUrl?: string;
    intervalMinutes?: number;
  }>(event);

  const shopUrl = String(body.shopUrl ?? "").trim();
  const parsed = shopUrl ? parseShopUrl(shopUrl) : null;
  const token = parsed?.token ?? String(body.token ?? "").trim();
  if (!token) throw createError({ statusCode: 400, statusMessage: "Token 不能为空" });

  const baseUrl = parsed?.baseUrl ?? String(body.baseUrl ?? "https://pay.ldxp.cn").trim();
  const channel = parsed?.channel ?? (isShopChannel(String(body.channel ?? "")) ? String(body.channel) : inferChannelFromBaseUrl(baseUrl));
  const intervalMinutes = Math.max(1, Math.trunc(Number(body.intervalMinutes || 10)));
  const name = String(body.name ?? "").trim() || token;

  const shop = await db.shop.upsert({
    where: { channel_token: { channel, token } },
    create: { channel, name, token, baseUrl, intervalMinutes, active: true },
    update: { name, baseUrl, intervalMinutes, active: true },
  });

  return { ok: true, message: "店铺已保存，可以同步商品了。", shopId: shop.id };
});
