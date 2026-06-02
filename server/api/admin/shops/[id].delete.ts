import db from "../../../utils/db";
import { requireAdmin } from "../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;

  const shop = await db.shop.findUnique({ where: { id } });
  if (!shop) {
    throw createError({ statusCode: 404, message: "店铺不存在" });
  }

  // 级联删除或断开相关数据，根据 Prisma schema
  // CollectionRun, PriceSnapshot, Listing, ShopCategory 都关联了 Shop
  // 为了安全且彻底地清理，依次删除该店铺的所有关联记录
  await db.$transaction([
    db.priceSnapshot.deleteMany({ where: { shopId: id } }),
    db.collectionRun.deleteMany({ where: { shopId: id } }),
    db.listing.deleteMany({ where: { shopId: id } }),
    db.shopCategory.deleteMany({ where: { shopId: id } }),
    db.shop.delete({ where: { id } }),
  ]);

  return { ok: true, message: "店铺及其关联数据已成功删除。" };
});
