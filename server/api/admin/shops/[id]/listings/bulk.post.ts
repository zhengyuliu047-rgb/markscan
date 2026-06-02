import db from "../../../../../utils/db";
import { requireAdmin } from "../../../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const shopId = getRouterParam(event, "id")!;
  const body = await readBody<{ mode?: string }>(event);
  const enable = body.mode === "enable";
  const result = await db.listing.updateMany({ where: { shopId }, data: { enabled: enable } });
  return { ok: true, message: `${enable ? "启用" : "停用"} ${result.count} 个商品。` };
});
