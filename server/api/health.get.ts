import db from "../utils/db";

export default defineEventHandler(async () => {
  await db.$queryRaw`SELECT 1`;
  return { ok: true, service: "markscan" };
});
