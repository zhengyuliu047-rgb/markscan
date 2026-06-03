import db from "./db";
import {
  fetchCategories,
  fetchGoodsInfo,
  fetchGoodsPage,
  fetchShopInfo,
  normalizeGoodsTypes,
  toInteger,
  toNumber,
  type LdxpGoods,
} from "./ldxp";
import { isExcludedProduct, matchesPriorityKeywords } from "./priority";
import { isShopChannel } from "./shops";

const PAGE_SIZE = 50;
const MAX_PAGES_PER_CATEGORY = 100;
const STALE_RUNNING_MINUTES = 30;
const FAILED_RUN_BACKOFF_MINUTES = 10;
const DEFAULT_AUTO_SYNC_INTERVAL_MINUTES = 6 * 60;
const MISSING_REASON = "enabled_listing_not_found";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUnavailableGoodsError(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes("商品未上架") || message.includes("商品不存在") || message.includes("商品已下架") || message.includes("未找到商品");
}

function getAutoSyncIntervalMinutes() {
  const value = Number(process.env.MARKSCAN_AUTO_SYNC_INTERVAL_MINUTES ?? DEFAULT_AUTO_SYNC_INTERVAL_MINUTES);
  if (!Number.isFinite(value)) return DEFAULT_AUTO_SYNC_INTERVAL_MINUTES;
  return Math.trunc(value);
}

function getAvailability(goods: LdxpGoods) {
  const status = (goods as { status?: number }).status;
  if (status === 0) return false;
  const stock = toInteger(goods.extend?.stock_count);
  return stock !== 0;
}

function shouldAutoEnable(goods: LdxpGoods) {
  return matchesPriorityKeywords(goods.name, goods.category?.name);
}

function shouldForceDisable(goods: LdxpGoods) {
  return isExcludedProduct(goods.name, goods.description, goods.category?.name);
}

function snapshotRaw(goods: LdxpGoods) {
  return JSON.stringify({ goods_key: goods.goods_key, name: goods.name, price: goods.price, market_price: goods.market_price, extend: goods.extend });
}

async function createListingSnapshot(input: { shopId: string; runId: string; listingId: string; standardProductId?: string | null; goods: LdxpGoods }) {
  const sampledAt = new Date();
  await db.priceSnapshot.create({
    data: {
      shopId: input.shopId,
      listingId: input.listingId,
      standardProductId: input.standardProductId,
      collectionRunId: input.runId,
      price: toNumber(input.goods.price),
      marketPrice: toNumber(input.goods.market_price),
      stock: toInteger(input.goods.extend?.stock_count),
      isAvailable: getAvailability(input.goods),
      sampledAt,
      raw: snapshotRaw(input.goods),
    },
  });
  await db.listing.update({ where: { id: input.listingId }, data: { lastSnapshotAt: sampledAt } });
}

async function createMissingSnapshot(input: { shopId: string; runId: string; listingId: string; standardProductId?: string | null; goodsKey: string }) {
  const sampledAt = new Date();
  await db.priceSnapshot.create({
    data: {
      shopId: input.shopId,
      listingId: input.listingId,
      standardProductId: input.standardProductId,
      collectionRunId: input.runId,
      price: null,
      marketPrice: null,
      stock: 0,
      isAvailable: false,
      sampledAt,
      raw: JSON.stringify({ reason: MISSING_REASON, goods_key: input.goodsKey }),
    },
  });
  await db.listing.update({ where: { id: input.listingId }, data: { isAvailable: false, stock: 0, lastSnapshotAt: sampledAt } });
}

async function createRun(input: { shopId: string; type: string; message: string }) {
  const staleCutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000);
  const running = await db.collectionRun.findFirst({
    where: { shopId: input.shopId, status: "running", startedAt: { gte: staleCutoff } },
    orderBy: { startedAt: "desc" },
  });

  if (running) throw new Error(`${running.type} task is already running for this shop`);

  return db.collectionRun.create({
    data: { shopId: input.shopId, type: input.type, status: "running", message: input.message },
  });
}

async function upsertListing(shopId: string, categoryId: string | null, goods: LdxpGoods) {
  const price = toNumber(goods.price);
  const marketPrice = toNumber(goods.market_price);
  const stock = toInteger(goods.extend?.stock_count);
  const now = new Date();
  const forceDisabled = shouldForceDisable(goods);

  return db.listing.upsert({
    where: { shopId_goodsKey: { shopId, goodsKey: goods.goods_key } },
    create: {
      shopId,
      categoryId,
      goodsKey: goods.goods_key,
      goodsType: goods.goods_type,
      title: goods.name,
      link: goods.link,
      image: goods.image || null,
      description: goods.description || null,
      price,
      marketPrice,
      stock,
      isAvailable: getAvailability(goods),
      enabled: !forceDisabled && shouldAutoEnable(goods),
      lastSeenAt: now,
    },
    update: {
      categoryId,
      goodsType: goods.goods_type,
      title: goods.name,
      link: goods.link,
      image: goods.image || null,
      description: goods.description || null,
      price,
      marketPrice,
      stock,
      isAvailable: getAvailability(goods),
      lastSeenAt: now,
    },
  });
}

export async function syncShopCatalog(shopId: string) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, include: { listings: { where: { enabled: true } } } });
  if (!shop) throw new Error("Shop not found");
  if (!isShopChannel(shop.channel)) throw new Error(`Unsupported channel: ${shop.channel}`);

  const run = await createRun({ shopId, type: "sync", message: "同步店铺分类和商品" });
  let runError: unknown = null;

  try {
    const info = await fetchShopInfo(shop.baseUrl, shop.token);
    const goodsTypes = normalizeGoodsTypes(info.goods_type_sort);
    const enabledByGoodsKey = new Map(shop.listings.map((item) => [item.goodsKey, item]));
    const seenEnabledListingIds = new Set<string>();
    let itemsSeen = 0;
    let snapshotsCreated = 0;

    await db.shop.update({ where: { id: shopId }, data: { name: info.nickname || shop.name, lastError: null } });

    for (const goodsType of goodsTypes) {
      const categories = await fetchCategories(shop.baseUrl, shop.token, goodsType);

      for (const item of categories) {
        const category = await db.shopCategory.upsert({
          where: { shopId_externalId_goodsType: { shopId, externalId: String(item.id), goodsType } },
          create: {
            shopId,
            externalId: String(item.id),
            goodsType,
            name: item.name,
            image: item.image || null,
            goodsCount: item.goods_count ?? 0,
          },
          update: { name: item.name, image: item.image || null, goodsCount: item.goods_count ?? 0 },
        });

        let current = 1;
        let categorySeen = 0;

        while (current <= MAX_PAGES_PER_CATEGORY) {
          const page = await fetchGoodsPage(shop.baseUrl, shop.token, {
            goodsType,
            categoryId: item.id,
            current,
            pageSize: PAGE_SIZE,
          });
          const goodsList = page.list ?? [];
          if (goodsList.length === 0) break;

          for (const goods of goodsList) {
            const listing = await upsertListing(shopId, category.id, goods);
            const trackedListing = enabledByGoodsKey.get(goods.goods_key);
            if (trackedListing) seenEnabledListingIds.add(trackedListing.id);
            if (listing.enabled) {
              await createListingSnapshot({ shopId, runId: run.id, listingId: listing.id, standardProductId: listing.standardProductId, goods });
              snapshotsCreated += 1;
            }
          }

          itemsSeen += goodsList.length;
          categorySeen += goodsList.length;
          if (categorySeen >= page.total || goodsList.length < PAGE_SIZE) break;
          current += 1;
          await wait(300);
        }
        await wait(300);
      }
    }

    for (const listing of shop.listings.filter((item) => !seenEnabledListingIds.has(item.id))) {
      await createMissingSnapshot({ shopId, runId: run.id, listingId: listing.id, standardProductId: listing.standardProductId, goodsKey: listing.goodsKey });
      snapshotsCreated += 1;
    }

    const finishedAt = new Date();
    await db.shop.update({
      where: { id: shopId },
      data: { lastSyncedAt: finishedAt, ...(snapshotsCreated > 0 ? { lastCollectedAt: finishedAt } : {}), lastError: null },
    });
    await db.collectionRun.update({
      where: { id: run.id },
      data: { status: "success", itemsSeen, snapshotsCreated, finishedAt, message: `同步完成，发现 ${itemsSeen} 个商品，写入 ${snapshotsCreated} 条快照` },
    });
    return { itemsSeen, snapshotsCreated };
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    const existing = await db.collectionRun.findUnique({ where: { id: run.id }, select: { status: true } });
    if (existing?.status === "running") {
      const message = runError ? getErrorMessage(runError) : "sync terminated unexpectedly";
      await db.collectionRun.update({ where: { id: run.id }, data: { status: "failed", error: message, finishedAt: new Date() } }).catch(() => {});
      await db.shop.update({ where: { id: shopId }, data: { lastError: message } }).catch(() => {});
    }
  }
}

export async function syncSingleGoods(input: { shopId: string; baseUrl: string; goodsKey: string; enabled?: boolean; goods?: LdxpGoods }) {
  const goods = input.goods ?? await fetchGoodsInfo(input.baseUrl, input.goodsKey);
  const category = goods.category
    ? await db.shopCategory.upsert({
        where: { shopId_externalId_goodsType: { shopId: input.shopId, externalId: String(goods.category.id), goodsType: goods.goods_type } },
        create: { shopId: input.shopId, externalId: String(goods.category.id), goodsType: goods.goods_type, name: goods.category.name, goodsCount: 0 },
        update: { name: goods.category.name },
      })
    : null;
  const listing = await upsertListing(input.shopId, category?.id ?? null, goods);
  if (input.enabled !== undefined) await db.listing.update({ where: { id: listing.id }, data: { enabled: input.enabled } });
  return { goods, listing };
}

export async function collectShop(shopId: string) {
  let shop = await db.shop.findUnique({
    where: { id: shopId },
    include: { categories: true, listings: { where: { enabled: true }, include: { category: true } } },
  });
  if (!shop) throw new Error("Shop not found");
  if (!isShopChannel(shop.channel)) throw new Error(`Unsupported channel: ${shop.channel}`);

  if (shop.categories.length === 0) {
    await syncShopCatalog(shopId);
    shop = await db.shop.findUnique({
      where: { id: shopId },
      include: { categories: true, listings: { where: { enabled: true }, include: { category: true } } },
    });
    if (!shop) throw new Error("Shop not found after sync");
  }

  const run = await createRun({ shopId, type: "collect", message: "采集已启用商品的价格和库存" });
  let runFinalized = false;

  const finalizeRun = async (data: Parameters<typeof db.collectionRun.update>[0]["data"]) => {
    if (runFinalized) return;
    runFinalized = true;
    await db.collectionRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ...data } });
  };

  try {
    let itemsSeen = 0;
    let snapshotsCreated = 0;
    let enabledListings = shop.listings;

    if (enabledListings.length === 0) {
      await db.shop.update({ where: { id: shopId }, data: { lastCollectedAt: new Date(), lastError: null } });
      await finalizeRun({ status: "success", itemsSeen: 0, snapshotsCreated: 0, message: "没有启用商品，跳过采集" });
      return { itemsSeen: 0, snapshotsCreated: 0 };
    }

    const enabledByGoodsKey = new Map(enabledListings.map((item) => [item.goodsKey, item]));
    const seenEnabledListingIds = new Set<string>();
    const enabledCategoryIds = new Set(enabledListings.map((item) => item.categoryId).filter((value): value is string => Boolean(value)));
    const fallbackGoodsTypes = new Set(enabledListings.filter((item) => !item.categoryId).map((item) => item.goodsType));
    const categoriesToFetch = shop.categories.filter(
      (category) => category.enabled && (enabledCategoryIds.has(category.id) || fallbackGoodsTypes.has(category.goodsType)),
    );

    for (const category of categoriesToFetch) {
      let current = 1;
      let categorySeen = 0;

      while (current <= MAX_PAGES_PER_CATEGORY) {
        const page = await fetchGoodsPage(shop.baseUrl, shop.token, {
          goodsType: category.goodsType,
          categoryId: category.externalId,
          current,
          pageSize: PAGE_SIZE,
        });
        const goodsList = page.list ?? [];
        if (goodsList.length === 0) break;

        for (const goods of goodsList) {
          await upsertListing(shopId, category.id, goods);
          itemsSeen += 1;
          const trackedListing = enabledByGoodsKey.get(goods.goods_key);
          if (!trackedListing) continue;
          seenEnabledListingIds.add(trackedListing.id);

          await createListingSnapshot({ shopId, runId: run.id, listingId: trackedListing.id, standardProductId: trackedListing.standardProductId, goods });
          snapshotsCreated += 1;
        }

        categorySeen += goodsList.length;
        if (categorySeen >= page.total || goodsList.length < PAGE_SIZE) break;
        current += 1;
        await wait(300);
      }
      await wait(300);
    }

    let missingListings = enabledListings.filter((listing) => !seenEnabledListingIds.has(listing.id));
    let unresolvedMissingListings = 0;
    for (const listing of missingListings) {
      try {
        const goods = await fetchGoodsInfo(shop.baseUrl, listing.goodsKey, shop.token);
        const category = goods.category
          ? await db.shopCategory.upsert({
              where: { shopId_externalId_goodsType: { shopId, externalId: String(goods.category.id), goodsType: goods.goods_type } },
              create: { shopId, externalId: String(goods.category.id), goodsType: goods.goods_type, name: goods.category.name, goodsCount: 0 },
              update: { name: goods.category.name },
            })
          : null;
        await upsertListing(shopId, category?.id ?? listing.categoryId, goods);
        seenEnabledListingIds.add(listing.id);
        itemsSeen += 1;
        await createListingSnapshot({ shopId, runId: run.id, listingId: listing.id, standardProductId: listing.standardProductId, goods });
        snapshotsCreated += 1;
      } catch (error) {
        const message = getErrorMessage(error);
        console.warn(`[collector] goodsInfo fallback failed for ${listing.goodsKey}: ${message}`);
        if (isUnavailableGoodsError(error)) {
          await createMissingSnapshot({ shopId, runId: run.id, listingId: listing.id, standardProductId: listing.standardProductId, goodsKey: listing.goodsKey });
          seenEnabledListingIds.add(listing.id);
          snapshotsCreated += 1;
        }
      }
    }

    missingListings = enabledListings.filter((listing) => !seenEnabledListingIds.has(listing.id));
    unresolvedMissingListings += missingListings.length;

    const finishedAt = new Date();
    await db.shop.update({ where: { id: shopId }, data: { lastCollectedAt: finishedAt, lastError: null } });
    await db.collectionRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        itemsSeen,
        snapshotsCreated,
        finishedAt,
        message: unresolvedMissingListings > 0
          ? `采集完成，写入 ${snapshotsCreated} 条快照，${unresolvedMissingListings} 个缺失商品未能确认`
          : `采集完成，写入 ${snapshotsCreated} 条快照`,
      },
    });
    return { itemsSeen, snapshotsCreated };
  } catch (error) {
    const message = getErrorMessage(error);
    await db.collectionRun.update({ where: { id: run.id }, data: { status: "failed", error: message, finishedAt: new Date() } }).catch(() => {});
    await db.shop.update({ where: { id: shopId }, data: { lastError: message } }).catch(() => {});
    throw error;
  } finally {
    // Safety net: if run is still "running" after try/catch (e.g. unhandled rejection, process issue),
    // mark it as failed so it doesn't block future scheduling.
    try {
      const currentRun = await db.collectionRun.findUnique({ where: { id: run.id }, select: { status: true } });
      if (currentRun?.status === "running") {
        await db.collectionRun.update({ where: { id: run.id }, data: { status: "failed", error: "run finalization safety net", finishedAt: new Date() } });
      }
    } catch {}
  }
}

export async function collectDueShops() {
  const autoSyncIntervalMinutes = getAutoSyncIntervalMinutes();
  const now = Date.now();

  try {
    const staleCutoff = new Date(now - STALE_RUNNING_MINUTES * 60 * 1000);
    const staleRuns = await db.collectionRun.updateMany({
      where: { status: "running", startedAt: { lt: staleCutoff } },
      data: { status: "failed", error: "forcibly terminated: stale running task", finishedAt: new Date() },
    });
    if (staleRuns.count > 0) console.warn(`[collector] cleared ${staleRuns.count} stale running tasks globally.`);
  } catch {}

  const shops = await db.shop.findMany({
    where: { active: true },
    include: { runs: { where: { type: { in: ["collect", "sync"] } }, orderBy: { startedAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "asc" },
  });
  const results: Array<{ shopId: string; type: "collect" | "sync"; status: "success" | "failed"; message: string }> = [];
  const eligibleShops = shops.filter((shop) => {
    const lastRun = shop.runs[0];
    if (lastRun?.status === "running") return now - lastRun.startedAt.getTime() >= STALE_RUNNING_MINUTES * 60 * 1000;
    if (lastRun?.status === "failed") return now - lastRun.startedAt.getTime() >= FAILED_RUN_BACKOFF_MINUTES * 60 * 1000;
    const lastFinished = lastRun?.finishedAt?.getTime() ?? lastRun?.startedAt.getTime() ?? 0;
    return now - lastFinished >= shop.intervalMinutes * 60 * 1000;
  });

  const [syncShop] = autoSyncIntervalMinutes > 0
    ? eligibleShops.filter((shop) => {
        if (!shop.lastSyncedAt) return true;
        return now - shop.lastSyncedAt.getTime() >= autoSyncIntervalMinutes * 60 * 1000;
      }).sort((a, b) => {
        const lastA = a.lastSyncedAt?.getTime() ?? 0;
        const lastB = b.lastSyncedAt?.getTime() ?? 0;
        if (lastA !== lastB) return lastA - lastB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
    : [];

  if (syncShop) {
    try {
      const result = await syncShopCatalog(syncShop.id);
      results.push({ shopId: syncShop.id, type: "sync", status: "success", message: `同步 ${result.itemsSeen} 个商品，写入 ${result.snapshotsCreated} 条快照` });
    } catch (error) {
      results.push({ shopId: syncShop.id, type: "sync", status: "failed", message: getErrorMessage(error) });
    }
    return results;
  }

  const [shop] = eligibleShops.sort((a, b) => {
    const aFailed = a.runs[0]?.status === "failed";
    const bFailed = b.runs[0]?.status === "failed";
    if (aFailed !== bFailed) return aFailed ? 1 : -1;
    const lastA = a.runs[0]?.finishedAt?.getTime() ?? a.runs[0]?.startedAt.getTime() ?? 0;
    const lastB = b.runs[0]?.finishedAt?.getTime() ?? b.runs[0]?.startedAt.getTime() ?? 0;
    if (lastA !== lastB) return lastA - lastB;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  if (!shop) return results;

  try {
    const result = await collectShop(shop.id);
    results.push({ shopId: shop.id, type: "collect", status: "success", message: `写入 ${result.snapshotsCreated} 条快照` });
  } catch (error) {
    results.push({ shopId: shop.id, type: "collect", status: "failed", message: getErrorMessage(error) });
  }

  return results;
}
