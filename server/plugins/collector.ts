import { collectDueShops } from "../utils/collector";

function randomDelay() {
  return 5_000 + Math.floor(Math.random() * 10_000); // 5–15 s
}

type CollectorState = {
  running: boolean;
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
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
    stopped: false,
    timer: null,
  };

  globalForCollector.__markscanCollector = state;

  function scheduleNext(delayMs = randomDelay()) {
    if (state.stopped) return;
    state.timer = setTimeout(() => {
      void tick();
    }, delayMs);
    if (typeof state.timer === "object" && typeof state.timer.unref === "function") state.timer.unref();
  }

  async function tick() {
    if (state.running) {
      console.log(`[collector] skip overlapping embedded tick ${new Date().toISOString()}`);
      return;
    }

    state.running = true;
    try {
      const results = await collectDueShops();
      const summary = results.map((item) => `${item.type}:${item.shopId}:${item.status}`).join(", ") || "no shops";
      console.log(`[collector] embedded ${new Date().toISOString()} ${summary}`);
    } catch (error) {
      console.error("[collector] embedded tick failed", error);
    } finally {
      state.running = false;
      scheduleNext();
    }
  }

  nitroApp.hooks.hookOnce("close", () => {
    state.stopped = true;
    if (state.timer) clearTimeout(state.timer);
    delete globalForCollector.__markscanCollector;
  });

  console.log("[collector] embedded scheduler started. Running one active shop task, then waiting 5–15 s (random) after completion.");
  void tick();
});
