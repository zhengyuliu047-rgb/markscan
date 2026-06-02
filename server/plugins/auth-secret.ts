import { randomBytes } from "crypto";
import db from "../utils/db";

const AUTH_SECRET_SETTING_KEY = "authSecret";

export default defineNitroPlugin(async () => {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32) return;

  const setting = await db.appSetting.upsert({
    where: { key: AUTH_SECRET_SETTING_KEY },
    create: { key: AUTH_SECRET_SETTING_KEY, value: randomBytes(32).toString("hex") },
    update: {},
  });

  process.env.AUTH_SECRET = setting.value;
  console.log("[auth] using database-backed AUTH_SECRET");
});
