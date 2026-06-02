import db from "../../utils/db";
import { requireAdmin } from "../../utils/auth";
import { collectShop, syncShopCatalog } from "../../utils/collector";
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
  let parsed: ReturnType<typeof parseShopUrl> | null = null;
  if (shopUrl) {
    try {
      parsed = parseShopUrl(shopUrl);
    } catch (error: any) {
      throw createError({ statusCode: 400, message: error?.message || "店铺 URL 格式不正确" });
    }
  }
  const token = parsed?.token ?? String(body.token ?? "").trim();
  if (!token) throw createError({ statusCode: 400, message: "Token 不能为空" });

  const baseUrl = parsed?.baseUrl ?? String(body.baseUrl ?? "https://pay.ldxp.cn").trim();
  const channel = parsed?.channel ?? (isShopChannel(String(body.channel ?? "")) ? String(body.channel) : inferChannelFromBaseUrl(baseUrl));
  const intervalMinutes = Math.max(1, Math.trunc(Number(body.intervalMinutes || 1)));
  const name = String(body.name ?? "").trim() || token;

  const shop = await db.shop.upsert({
    where: { channel_token: { channel, token } },
    create: { channel, name, token, baseUrl, intervalMinutes, active: true },
    update: { name, baseUrl, intervalMinutes, active: true },
  });

  try {
    const syncResult = await syncShopCatalog(shop.id);
    const collectResult = await collectShop(shop.id);
    return {
      ok: true,
      message: `店铺已保存并同步完成，发现 ${syncResult.itemsSeen} 个商品，采集 ${collectResult.snapshotsCreated} 条快照。`,
      shopId: shop.id,
      result: { sync: syncResult, collect: collectResult },
    };
  } catch (error: any) {
    if (error?.message?.includes("already running")) {
      throw createError({ statusCode: 409, message: "店铺已保存，但同步或采集任务已在运行中，请稍后查看。" });
    }
    throw createError({ statusCode: 502, message: `店铺已保存，但自动同步或采集失败：${error?.message || "未知错误"}` });
  }
});
