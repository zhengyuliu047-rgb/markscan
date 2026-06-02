import db from "../utils/db";
import { getPriorityLabel, getPriorityScore } from "../utils/priority";

function getChange(current?: number | null, previous?: number | null) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return Number((current - previous).toFixed(2));
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const keyword = String(query.q ?? "").trim();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const listingWhere = {
    enabled: true,
    snapshots: { some: {} },
    ...(keyword
      ? {
          OR: [
            { title: { contains: keyword } },
            { goodsKey: { contains: keyword } },
            { shop: { name: { contains: keyword } } },
            { standardProduct: { name: { contains: keyword } } },
          ],
        }
      : {}),
  };

  const [listings, recentSnapshots, shopCount, enabledListingCount, snapshotCount24h] = await Promise.all([
    db.listing.findMany({
      where: listingWhere,
      include: {
        shop: true,
        category: true,
        standardProduct: true,
        snapshots: { orderBy: { sampledAt: "desc" }, take: 2 },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 120,
    }),
    db.priceSnapshot.findMany({
      where: { listing: { enabled: true } },
      include: { listing: { include: { shop: true, standardProduct: true } } },
      orderBy: { sampledAt: "desc" },
      take: 24,
    }),
    db.shop.count({ where: { active: true } }),
    db.listing.count({ where: { enabled: true } }),
    db.priceSnapshot.count({ where: { sampledAt: { gte: since24h }, listing: { enabled: true } } }),
  ]);

  const sortedListings = listings.sort((left, right) => {
    const leftScore = getPriorityScore(left.title, left.standardProduct?.name, left.category?.name);
    const rightScore = getPriorityScore(right.title, right.standardProduct?.name, right.category?.name);
    if (leftScore !== rightScore) return rightScore - leftScore;
    const leftLatest = left.snapshots[0];
    const rightLatest = right.snapshots[0];
    if (Boolean(leftLatest?.isAvailable) !== Boolean(rightLatest?.isAvailable)) return leftLatest?.isAvailable ? -1 : 1;
    return (leftLatest?.price ?? Number.MAX_SAFE_INTEGER) - (rightLatest?.price ?? Number.MAX_SAFE_INTEGER);
  });

  const availableListings = sortedListings.filter((listing) => {
    const latest = listing.snapshots[0];
    return latest?.isAvailable && latest.price !== null;
  });
  const lowest = availableListings.reduce<(typeof availableListings)[number] | undefined>((best, listing) => {
    if (!best) return listing;
    return (listing.snapshots[0]?.price ?? Number.MAX_SAFE_INTEGER) < (best.snapshots[0]?.price ?? Number.MAX_SAFE_INTEGER) ? listing : best;
  }, undefined);
  const lowestSnapshot = lowest?.snapshots[0];

  return {
    metrics: {
      shopCount,
      trackedCount: sortedListings.length,
      enabledListingCount,
      availableCount: availableListings.length,
      unavailableCount: sortedListings.filter((listing) => !listing.snapshots[0]?.isAvailable).length,
      snapshotCount24h,
      lowest: lowest
        ? { title: lowest.title, price: lowestSnapshot?.price ?? null, shopName: lowest.shop.name }
        : null,
    },
    listings: sortedListings.map((listing) => {
      const latest = listing.snapshots[0];
      const previous = listing.snapshots[1];
      return {
        id: listing.id,
        title: listing.title,
        displayName: listing.standardProduct?.name ?? listing.title,
        goodsKey: listing.goodsKey,
        goodsType: listing.goodsType,
        link: listing.link,
        shopName: listing.shop.name,
        shopChannel: listing.shop.channel,
        categoryName: listing.category?.name ?? listing.goodsType,
        priorityLabel: getPriorityLabel(listing.title, listing.standardProduct?.name, listing.category?.name),
        latestPrice: latest?.price ?? null,
        latestStock: latest?.stock ?? null,
        latestAvailable: Boolean(latest?.isAvailable),
        sampledAt: latest?.sampledAt ?? null,
        change: getChange(latest?.price, previous?.price),
      };
    }),
    recentSnapshots: recentSnapshots.map((snapshot) => ({
      id: snapshot.id,
      title: snapshot.listing.standardProduct?.name ?? snapshot.listing.title,
      shopName: snapshot.listing.shop.name,
      sampledAt: snapshot.sampledAt,
      price: snapshot.price,
      isAvailable: snapshot.isAvailable,
    })),
  };
});
