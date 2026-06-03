<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-kicker">MARKSCAN OPS</div>
        <div class="brand-title">采集控制台</div>
      </div>

      <nav class="nav">
        <NuxtLink to="/admin">店铺与采集</NuxtLink>
        <NuxtLink to="/market">价格看板</NuxtLink>
      </nav>

      <div class="sidebar-footer">
        <div class="label">当前账号</div>
        <div class="sidebar-user">{{ session?.username || 'admin' }}</div>
        <var-button block @click="logout">退出登录</var-button>
      </div>
    </aside>

    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
type Session = { authenticated: boolean; username: string | null };
const { data: session } = await useAsyncData<Session>("admin-session", () => {
  const sessionFetch = import.meta.server ? useRequestFetch() : $fetch;
  return sessionFetch<Session>("/api/auth/session", { credentials: "include" });
});

async function logout() {
  await $fetch("/api/auth/logout", { method: "POST" });
  await navigateTo("/login");
}
</script>
