<template>
  <main class="login-screen">
    <section class="login-card">
      <div class="eyebrow">Admin access</div>
      <h1>登录采集后台</h1>
      <p class="muted">后台操作已迁移为 Nuxt + Varlet 客户端交互，不再整页刷新。</p>

      <form class="login-form" @submit.prevent="login">
        <label class="field">
          <span class="label">账号</span>
          <input v-model="form.username" class="input" placeholder="admin" required />
        </label>
        <label class="field">
          <span class="label">密码</span>
          <input v-model="form.password" type="password" class="input" placeholder="请输入密码" required />
        </label>
        <var-button type="primary" block native-type="submit" :loading="loading">进入后台</var-button>
      </form>

      <var-snackbar v-model:show="notice.show" :type="notice.type">
        {{ notice.message }}
      </var-snackbar>
    </section>
  </main>
</template>

<script setup lang="ts">
const form = reactive({ username: "", password: "" });
const loading = ref(false);
type NoticeType = "success" | "error";
const notice = reactive<{ show: boolean; type: NoticeType; message: string }>({ show: false, type: "error", message: "" });

const { data: session } = await useFetch<{ authenticated: boolean }>("/api/auth/session", { credentials: "include" });
if (session.value?.authenticated) await navigateTo("/admin");

function showNotice(message: string, type: NoticeType = "error") {
  notice.message = message;
  notice.type = type;
  notice.show = true;
}

async function login() {
  loading.value = true;
  try {
    await $fetch("/api/auth/login", { method: "POST", body: form });
    showNotice("登录成功", "success");
    await navigateTo("/admin");
  } catch (error: any) {
    showNotice(error?.data?.message || error?.statusMessage || "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>
