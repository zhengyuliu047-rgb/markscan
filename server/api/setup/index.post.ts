import db from "../../utils/db";
import { hashPassword, isSetupComplete, setAdminSession } from "../../utils/auth";
import { collectShop, syncShopCatalog } from "../../utils/collector";
import { parseShopUrl } from "../../utils/shops";

export default defineEventHandler(async (event) => {
  if (await isSetupComplete()) throw createError({ statusCode: 409, message: "系统已完成初始化" });

  const body = await readBody<{ username?: string; password?: string; shopUrl?: string; active?: boolean }>(event);
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const shopUrl = String(body.shopUrl ?? "").trim();
  const active = body.active !== false;

  if (username.length < 3) throw createError({ statusCode: 400, message: "管理员账号至少 3 个字符" });
  if (password.length < 8) throw createError({ statusCode: 400, message: "管理员密码至少 8 个字符" });

  const admin = await db.adminUser.create({ data: { username, passwordHash: hashPassword(password) } });
  setAdminSession(event, admin.username);

  const warnings: string[] = [];
  let shopId: string | null = null;

  if (shopUrl) {
    try {
      const parsed = parseShopUrl(shopUrl);
      const shop = await db.shop.upsert({
        where: { channel_token: { channel: parsed.channel, token: parsed.token } },
        create: { channel: parsed.channel, token: parsed.token, name: parsed.token, baseUrl: parsed.baseUrl, intervalMinutes: 1, active },
        update: { baseUrl: parsed.baseUrl, active },
      });
      shopId = shop.id;
      await syncShopCatalog(shop.id);
      if (active) await collectShop(shop.id);
    } catch (error: any) {
      warnings.push(`店铺已跳过：${error?.message || "同步失败"}`);
    }
  }

  return {
    ok: true,
    shopId,
    message: warnings.length ? `初始化完成，但${warnings.join("；")}` : "初始化完成，已进入后台。",
  };
});
