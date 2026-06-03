import { requireAdmin } from "../../../../utils/auth";
import { syncShopCatalog } from "../../../../utils/collector";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  try {
    const result = await syncShopCatalog(id);
    return { ok: true, message: `同步完成，发现 ${result.itemsSeen} 个商品，写入 ${result.snapshotsCreated} 条快照。`, result };
  } catch (error: any) {
    if (error?.message?.includes("already running")) {
      throw createError({ statusCode: 409, message: "同步任务已在运行中，请稍后再试。" });
    }
    throw error;
  }
});
