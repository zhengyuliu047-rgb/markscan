export default defineNuxtRouteMiddleware(async () => {
  const { data, error } = await useFetch<{ authenticated: boolean }>("/api/auth/session", {
    credentials: "include",
  });

  if (error.value || !data.value?.authenticated) {
    return navigateTo("/login");
  }
});
