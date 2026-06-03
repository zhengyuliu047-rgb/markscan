export default defineNuxtRouteMiddleware(async () => {
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch;
  const session = await requestFetch<{ authenticated: boolean; initialized: boolean }>("/api/auth/session", { credentials: "include" }).catch(() => null);

  if (session && !session.initialized) {
    return navigateTo("/setup");
  }

  if (!session?.authenticated) {
    return navigateTo("/login");
  }
});
