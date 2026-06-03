import db from "../server/utils/db";
import { collectDueShops } from "../server/utils/collector";

function randomDelay() { return 5_000 + Math.floor(Math.random() * 10_000); }
let running = false;
let stopped = false;

async function tick() {
  if (running) {
    console.log(`[collector] skip overlapping tick ${new Date().toISOString()}`);
    return;
  }

  running = true;
  try {
    const results = await collectDueShops();
    const summary = results.map((item) => `${item.type}:${item.shopId}:${item.status}`).join(", ") || "no shops";
    console.log(`[collector] ${new Date().toISOString()} ${summary}`);
  } catch (error) {
    console.error("[collector] tick failed", error);
  } finally {
    running = false;
  }
}

async function loop() {
  while (!stopped) {
    await tick();
    if (!stopped) await new Promise((resolve) => setTimeout(resolve, randomDelay()));
  }
}

console.log("[collector] started. Running one active shop task, then waiting 5–15 s (random) after completion.");
void loop();

process.on("SIGINT", async () => {
  console.log("[collector] stopping");
  stopped = true;
  await db.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[collector] stopping");
  stopped = true;
  await db.$disconnect();
  process.exit(0);
});
