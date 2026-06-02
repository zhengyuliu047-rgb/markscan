import { requireAdmin } from "../../../../utils/auth";
import { collectShop } from "../../../../utils/collector";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  const result = await collectShop(id);
  return { ok: true, message: `采集完成，写入 ${result.snapshotsCreated} 条快照。`, result };
});
