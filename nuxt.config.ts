export default defineNuxtConfig({
  compatibilityDate: "2026-06-02",
  devtools: { enabled: true },
  css: ["@varlet/ui/lib/varlet.css", "~/assets/styles.css"],
  nitro: {
    preset: "node-server",
  },
  runtimeConfig: {
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    authSecret: process.env.AUTH_SECRET || "",
  },
  app: {
    head: {
      title: "Markscan AI 行情",
      htmlAttrs: { lang: "zh-CN" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: "AI 商品行情采集与价格监控" },
      ],
    },
  },
});
