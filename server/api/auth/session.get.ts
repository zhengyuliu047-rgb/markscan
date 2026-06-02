import { getAdminSession, isSetupComplete } from "../../utils/auth";

export default defineEventHandler(async (event) => {
  const session = getAdminSession(event);
  return { authenticated: Boolean(session), initialized: await isSetupComplete(), username: session?.username ?? null };
});
