import db from "../../../utils/db";
import { requireAdmin } from "../../../utils/auth";
import { inferChannelFromBaseUrl } from "../../../utils/shops";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{ name?: string; baseUrl?: string; intervalMinutes?: number; active?: boolean }>(event);
  const baseUrl = String(body.baseUrl ?? "").trim();
  if (!baseUrl) throw createError({ statusCode: 400, message: "Base URL 不能为空" });

  await db.shop.update({
    where: { id },
    data: {
      name: String(body.name ?? "").trim() || "未命名店铺",
      baseUrl,
      channel: inferChannelFromBaseUrl(baseUrl),
      intervalMinutes: Math.max(1, Math.trunc(Number(body.intervalMinutes || 10))),
      active: Boolean(body.active),
    },
  });

  return { ok: true, message: "店铺配置已保存。" };
});
