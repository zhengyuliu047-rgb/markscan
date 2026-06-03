<template>
  <main class="login-screen setup-screen">
    <section class="login-card setup-card">
      <div class="eyebrow">首次使用</div>
      <h1>初始化 Markscan</h1>
      <p class="muted">创建管理员账号，可选添加第一个店铺。数据库会由部署脚本自动迁移，不需要在这里配置。</p>

      <form class="login-form" @submit.prevent="setup">
        <label class="field">
          <span class="label">管理员账号</span>
          <input v-model="form.username" class="input" placeholder="admin" required />
        </label>
        <label class="field">
          <span class="label">管理员密码</span>
          <input v-model="form.password" type="password" class="input" placeholder="至少 8 个字符" required />
        </label>
        <label class="field">
          <span class="label">确认密码</span>
          <input v-model="confirmPassword" type="password" class="input" placeholder="再次输入密码" required />
        </label>
        <label class="field">
          <span class="label">店铺 / 商品 URL（可选）</span>
          <input v-model="form.shopUrl" class="input" placeholder="https://pay.ldxp.cn/item/5x5x0a" />
        </label>
        <label class="inline-form setup-toggle">
          <input v-model="form.active" type="checkbox" />
          <span>启用自动采集</span>
        </label>
        <var-button type="primary" block native-type="submit" :loading="loading">完成初始化</var-button>
      </form>

      <var-snackbar v-model:show="notice.show" :type="notice.type">
        {{ notice.message }}
      </var-snackbar>
    </section>
  </main>
</template>

<script setup lang="ts">
const form = reactive({ username: "admin", password: "", shopUrl: "", active: true });
const confirmPassword = ref("");
const loading = ref(false);
type NoticeType = "success" | "error";
const notice = reactive<{ show: boolean; type: NoticeType; message: string }>({ show: false, type: "error", message: "" });
const sessionFetch = import.meta.server ? useRequestFetch() : $fetch;

const { data: status } = await useFetch<{ initialized: boolean }>("/api/setup/status");
if (status.value?.initialized) {
  const session = await sessionFetch<{ authenticated: boolean }>("/api/auth/session", { credentials: "include" }).catch(() => null);
  await navigateTo(session?.authenticated ? "/admin" : "/login");
}

function showNotice(message: string, type: NoticeType = "error") {
  notice.message = message;
  notice.type = type;
  notice.show = true;
}

async function setup() {
  if (form.password !== confirmPassword.value) {
    showNotice("两次输入的密码不一致");
    return;
  }

  loading.value = true;
  try {
    const result: any = await $fetch("/api/setup", { method: "POST", body: form });
    showNotice(result?.message || "初始化完成", "success");
    await clearNuxtData();
    await navigateTo("/admin", { replace: true });
  } catch (error: any) {
    showNotice(error?.data?.message || error?.statusMessage || "初始化失败");
  } finally {
    loading.value = false;
  }
}
</script>
