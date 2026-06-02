import { setAdminSession, verifyAdminCredentials } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event);
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!verifyAdminCredentials(username, password)) {
    throw createError({ statusCode: 401, message: "账号或密码不正确" });
  }

  setAdminSession(event, username);
  return { ok: true, message: "登录成功" };
});
