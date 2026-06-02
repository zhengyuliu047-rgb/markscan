import { requireAdmin } from "../../../../utils/auth";
import { collectShop } from "../../../../utils/collector";

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id")!;
  try {
    const result = await collectShop(id);
    return { ok: true, message: `采集完成，写入 ${result.snapshotsCreated} 条快照。`, result };
  } catch (error: any) {
    if (error?.message?.includes("already running")) {
      throw createError({ statusCode: 409, message: "采集任务已在运行中，请稍后再试。" });
    }
    throw error;
  }
});
