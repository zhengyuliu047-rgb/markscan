import db from "../../utils/db";
import { requireAdmin } from "../../utils/auth";
import { syncSingleGoods } from "../../utils/collector";
import { fetchGoodsInfo } from "../../utils/ldxp";
import { inferChannelFromBaseUrl, isShopChannel, parseShopOrGoodsUrl } from "../../utils/shops";

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
  let parsed: ReturnType<typeof parseShopOrGoodsUrl> | null = null;
  if (shopUrl) {
    try {
      parsed = parseShopOrGoodsUrl(shopUrl);
    } catch (error: any) {
      throw createError({ statusCode: 400, message: error?.message || "URL 格式不正确" });
    }
  }

  if (parsed?.kind === "item") {
    const goods = await fetchGoodsInfo(parsed.baseUrl, parsed.goodsKey);
    const token = goods.user?.token?.trim();
    if (!token) throw createError({ statusCode: 502, message: "商品存在，但未能解析到所属店铺。" });
    const shop = await db.shop.upsert({
      where: { channel_token: { channel: parsed.channel, token } },
      create: { channel: parsed.channel, name: goods.user?.nickname || token, token, baseUrl: parsed.baseUrl, intervalMinutes: 5, active: true },
      update: { name: goods.user?.nickname || token, baseUrl: parsed.baseUrl, intervalMinutes: 5, active: true },
    });

    const singleResult = await syncSingleGoods({ shopId: shop.id, baseUrl: parsed.baseUrl, goodsKey: parsed.goodsKey, enabled: true, goods });
    return {
      ok: true,
      message: `商品已加入采集列表：${singleResult.goods.name}。所属店铺：${goods.user?.nickname || token}。全店同步已加入队列，稍后自动执行。`,
      shopId: shop.id,
      result: { goodsKey: parsed.goodsKey },
    };
  }

  const token = parsed?.kind === "shop" ? parsed.token : String(body.token ?? "").trim();
  if (!token) throw createError({ statusCode: 400, message: "Token 不能为空" });

  const baseUrl = parsed?.kind === "shop" ? parsed.baseUrl : String(body.baseUrl ?? "https://pay.ldxp.cn").trim();
  const channel = parsed?.kind === "shop" ? parsed.channel : (isShopChannel(String(body.channel ?? "")) ? String(body.channel) : inferChannelFromBaseUrl(baseUrl));
  const intervalMinutes = Math.max(1, Math.trunc(Number(body.intervalMinutes || 5)));
  const name = String(body.name ?? "").trim() || token;

  const shop = await db.shop.upsert({
    where: { channel_token: { channel, token } },
    create: { channel, name, token, baseUrl, intervalMinutes, active: true },
    update: { name, baseUrl, intervalMinutes, active: true },
  });

  return {
    ok: true,
    message: `店铺已保存，全店同步已加入队列，稍后自动执行。`,
    shopId: shop.id,
  };
});
