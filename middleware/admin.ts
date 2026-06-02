export default defineNuxtRouteMiddleware(async () => {
  const { data, error } = await useFetch<{ authenticated: boolean; initialized: boolean }>("/api/auth/session", {
    credentials: "include",
  });

  if (!error.value && data.value && !data.value.initialized) {
    return navigateTo("/setup");
  }

  if (error.value || !data.value?.authenticated) {
    return navigateTo("/login");
  }
});
