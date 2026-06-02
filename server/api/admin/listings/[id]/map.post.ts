import db from "../../../../utils/db";
import { requireAdmin } from "../../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const body = await readBody<{ standardProductName?: string }>(event);
  const name = String(body.standardProductName ?? "").trim();
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) throw createError({ statusCode: 404, statusMessage: "商品不存在" });

  if (!name) {
    await db.listing.update({ where: { id }, data: { standardProductId: null } });
  } else {
    const product = await db.standardProduct.upsert({ where: { name }, create: { name }, update: {} });
    await db.listing.update({ where: { id }, data: { standardProductId: product.id } });
  }

  return { ok: true, message: "标准商品映射已保存。" };
});
