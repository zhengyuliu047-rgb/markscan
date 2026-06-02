import cron from "node-cron";
import db from "../server/utils/db";
import { collectDueShops } from "../server/utils/collector";

let running = false;

async function tick() {
  if (running) {
    console.log(`[collector] skip overlapping tick ${new Date().toISOString()}`);
    return;
  }

  running = true;
  try {
    const results = await collectDueShops();
    const summary = results.map((item) => `${item.shopId}:${item.status}`).join(", ") || "no shops";
    console.log(`[collector] ${new Date().toISOString()} ${summary}`);
  } catch (error) {
    console.error("[collector] tick failed", error);
  } finally {
    running = false;
  }
}

console.log("[collector] started. Collecting one active shop per minute.");
void tick();

cron.schedule("* * * * *", () => {
  void tick();
});

process.on("SIGINT", async () => {
  console.log("[collector] stopping");
  await db.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[collector] stopping");
  await db.$disconnect();
  process.exit(0);
});
