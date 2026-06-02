import db from "../../../../utils/db";
import { requireAdmin } from "../../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) throw createError({ statusCode: 404, statusMessage: "商品不存在" });
  await db.listing.update({ where: { id }, data: { enabled: !listing.enabled } });
  return { ok: true, message: listing.enabled ? "商品已停用采集。" : "商品已启用采集。" };
});
