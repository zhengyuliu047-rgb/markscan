export default defineNuxtRouteMiddleware(async () => {
  const session = await $fetch<{ authenticated: boolean; initialized: boolean }>("/api/auth/session", { credentials: "include" }).catch(() => null);

  if (session && !session.initialized) {
    return navigateTo("/setup");
  }

  if (!session?.authenticated) {
    return navigateTo("/login");
  }
});
