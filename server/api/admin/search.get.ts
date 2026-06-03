import db from "../../utils/db";
import { requireAdmin } from "../../utils/auth";

const SHOP_LIMIT = 8;
const LISTING_LIMIT = 24;

function searchFilter(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

function getSearchTerms(value: string) {
  const terms = new Set<string>();
  const raw = value.trim();
  if (!raw) return [];

  terms.add(raw);
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/(?:shop|item)\/([^/?#]+)/i);
    if (match?.[1]) terms.add(match[1]);
  } catch {
    const match = raw.match(/\/(?:shop|item)\/([^/?#]+)/i);
    if (match?.[1]) terms.add(match[1]);
  }

  return [...terms].slice(0, 3);
}

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const query = String(getQuery(event).q ?? "").trim();
  const terms = getSearchTerms(query);
  if (terms.length === 0) return { query, shops: [], listings: [] };

  const shopOr = terms.flatMap((term) => [
    { name: searchFilter(term) },
    { token: searchFilter(term) },
    { baseUrl: searchFilter(term) },
  ]);
  const listingOr = terms.flatMap((term) => [
    { title: searchFilter(term) },
    { goodsKey: searchFilter(term) },
    { link: searchFilter(term) },
    { description: searchFilter(term) },
    { shop: { name: searchFilter(term) } },
    { shop: { token: searchFilter(term) } },
    { category: { name: searchFilter(term) } },
    { standardProduct: { name: searchFilter(term) } },
  ]);

  const [shops, listings] = await Promise.all([
    db.shop.findMany({
      where: { OR: shopOr },
      include: { _count: { select: { listings: true, snapshots: true } } },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      take: SHOP_LIMIT,
    }),
    db.listing.findMany({
      where: { OR: listingOr },
      include: { shop: true, category: true, standardProduct: true },
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
      take: LISTING_LIMIT,
    }),
  ]);

  return {
    query,
    shops: shops.map((shop) => ({
      id: shop.id,
      name: shop.name,
      channel: shop.channel,
      token: shop.token,
      baseUrl: shop.baseUrl,
      active: shop.active,
      listingsCount: shop._count.listings,
      snapshotsCount: shop._count.snapshots,
      lastSyncedAt: shop.lastSyncedAt,
      lastCollectedAt: shop.lastCollectedAt,
    })),
    listings: listings.map((listing) => ({
      id: listing.id,
      shopId: listing.shopId,
      shopName: listing.shop.name,
      shopToken: listing.shop.token,
      title: listing.title,
      goodsKey: listing.goodsKey,
      link: listing.link,
      categoryName: listing.category?.name ?? listing.goodsType,
      standardProductName: listing.standardProduct?.name ?? null,
      enabled: listing.enabled,
      isAvailable: listing.isAvailable,
      price: listing.price,
      stock: listing.stock,
      lastSeenAt: listing.lastSeenAt,
      lastSnapshotAt: listing.lastSnapshotAt,
    })),
  };
});
