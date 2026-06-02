import { collectDueShops } from "../utils/collector";

const COLLECTOR_INTERVAL_MS = 60_000;

type CollectorState = {
  running: boolean;
  timer: ReturnType<typeof setInterval>;
};

const globalForCollector = globalThis as typeof globalThis & { __markscanCollector?: CollectorState };

export default defineNitroPlugin((nitroApp) => {
  if (process.env.MARKSCAN_DISABLE_EMBEDDED_COLLECTOR === "1") {
    console.log("[collector] embedded scheduler disabled");
    return;
  }

  if (globalForCollector.__markscanCollector) return;

  const state: CollectorState = {
    running: false,
    timer: setInterval(() => {
      void tick();
    }, COLLECTOR_INTERVAL_MS),
  };

  globalForCollector.__markscanCollector = state;

  if (typeof state.timer === "object" && typeof state.timer.unref === "function") state.timer.unref();

  async function tick() {
    if (state.running) {
      console.log(`[collector] skip overlapping embedded tick ${new Date().toISOString()}`);
      return;
    }

    state.running = true;
    try {
      const results = await collectDueShops();
      const summary = results.map((item) => `${item.shopId}:${item.status}`).join(", ") || "no shops";
      console.log(`[collector] embedded ${new Date().toISOString()} ${summary}`);
    } catch (error) {
      console.error("[collector] embedded tick failed", error);
    } finally {
      state.running = false;
    }
  }

  nitroApp.hooks.hookOnce("close", () => {
    clearInterval(state.timer);
    delete globalForCollector.__markscanCollector;
  });

  console.log("[collector] embedded scheduler started. Collecting one active shop per minute.");
  void tick();
});
