import db from "../../utils/db";
import { requireAdmin } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  requireAdmin(event);

  const [shops, recentRuns, shopCount, enabledListings, snapshots] = await Promise.all([
    db.shop.findMany({
      include: { _count: { select: { categories: true, listings: true, snapshots: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.collectionRun.findMany({ take: 10, include: { shop: true }, orderBy: { startedAt: "desc" } }),
    db.shop.count(),
    db.listing.count({ where: { enabled: true } }),
    db.priceSnapshot.count(),
  ]);

  return { shops, recentRuns, counts: { shopCount, enabledListings, snapshots } };
});
