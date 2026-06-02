import db from "../../../utils/db";
import { requireAdmin } from "../../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;

  const [shop, recentRuns, recentSnapshots] = await Promise.all([
    db.shop.findUnique({
      where: { id },
      include: {
        categories: { orderBy: [{ goodsType: "asc" }, { name: "asc" }] },
        listings: { include: { category: true, standardProduct: true }, orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }] },
      },
    }),
    db.collectionRun.findMany({ where: { shopId: id }, orderBy: { startedAt: "desc" }, take: 12 }),
    db.priceSnapshot.findMany({
      where: { shopId: id },
      include: { listing: true, standardProduct: true },
      orderBy: { sampledAt: "desc" },
      take: 20,
    }),
  ]);

  if (!shop) throw createError({ statusCode: 404, statusMessage: "店铺不存在" });
  return { shop, recentRuns, recentSnapshots };
});
