import { requireAdmin } from "../../../../utils/auth";
import { syncShopCatalog } from "../../../../utils/collector";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const result = await syncShopCatalog(id);
  return { ok: true, message: `同步完成，发现 ${result.itemsSeen} 个商品。`, result };
});
