import { clearAdminSession } from "../../utils/auth";

export default defineEventHandler((event) => {
  clearAdminSession(event);
  return { ok: true, message: "已退出登录" };
});
