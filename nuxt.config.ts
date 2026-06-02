export default defineNuxtConfig({
  compatibilityDate: "2026-06-02",
  devtools: { enabled: process.env.NODE_ENV !== "production" },
  css: ["@varlet/ui/lib/varlet.css", "~/assets/styles.css"],
  nitro: {
    preset: "node-server",
  },
  runtimeConfig: {
    adminUsername: process.env.ADMIN_USERNAME || "",
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
    authSecret: process.env.AUTH_SECRET || "",
  },
  app: {
    head: {
      title: "Markscan 商品价格看板",
      htmlAttrs: { lang: "zh-CN" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "description", content: "商品价格采集与监控看板" },
      ],
    },
  },
});
