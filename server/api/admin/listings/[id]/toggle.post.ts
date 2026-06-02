import db from "../../../../utils/db";
import { requireAdmin } from "../../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) throw createError({ statusCode: 404, message: "商品不存在" });
  const updated = await db.listing.update({ where: { id }, data: { enabled: !listing.enabled } });
  return { ok: true, message: updated.enabled ? "商品已启用采集。" : "商品已停用采集。", listing: { id: updated.id, enabled: updated.enabled } };
});
