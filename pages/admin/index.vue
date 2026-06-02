<template>
  <section class="hero">
    <div>
      <div class="eyebrow">Persistent collector</div>
      <h1>后台配置店铺，持续采集商品价格。</h1>
      <p>Nuxt + Varlet 版本：按钮操作只局部刷新数据，并在当前页面显示提示。</p>
    </div>
  </section>

  <section class="grid cols-3" style="margin-bottom: 16px">
    <div class="metric"><div class="label">Shops</div><div class="metric-value">{{ data?.counts.shopCount || 0 }}</div><div class="muted">已配置店铺</div></div>
    <div class="metric"><div class="label">Tracked SKU</div><div class="metric-value">{{ data?.counts.enabledListings || 0 }}</div><div class="muted">已启用采集商品</div></div>
    <div class="metric"><div class="label">Snapshots</div><div class="metric-value">{{ data?.counts.snapshots || 0 }}</div><div class="muted">累计价格快照</div></div>
  </section>

  <section class="card" style="margin-bottom: 16px">
    <div class="card-header">
      <div>
        <div class="card-title">添加店铺</div>
        <div class="muted">支持 LDXP 和 CatFK，可直接填完整店铺 URL。</div>
      </div>
    </div>
    <div class="card-pad">
      <form class="form-grid" @submit.prevent="createShop">
        <label class="field"><span class="label">店铺 URL</span><input v-model="form.shopUrl" class="input" placeholder="https://pay.qxvx.cn/item/iwsoql" /></label>
        <div class="field"><span class="label">渠道</span><var-select v-model="form.channel" class="channel-select" :class="{ 'locked-field': usingShopUrl }" :options="channelOptions" variant="outlined" :line="false" :hint="false" :readonly="usingShopUrl" text-color="#f0eadc" focus-color="#d5ff5f" blur-color="#33382f" /></div>
        <label class="field"><span class="label">名称</span><input v-model="form.name" class="input" placeholder="可空" /></label>
        <label class="field"><span class="label">Token</span><input v-model="form.token" class="input" :readonly="usingShopUrl" placeholder="7N1H7DQI" /></label>
        <label class="field"><span class="label">Base URL</span><input v-model="form.baseUrl" class="input" :readonly="usingShopUrl" placeholder="https://pay.ldxp.cn" /></label>
        <label class="field"><span class="label">间隔</span><input v-model.number="form.intervalMinutes" class="input" type="number" min="1" /></label>
        <var-button type="primary" native-type="submit" :loading="loading.create">添加店铺</var-button>
        <div v-if="usingShopUrl" class="form-note">已从店铺 URL 自动解析渠道、Token 和 Base URL。要手动填写，请先清空店铺 URL。</div>
      </form>
    </div>
  </section>

  <section class="card" style="margin-bottom: 16px">
    <div class="card-header"><div class="card-title">店铺列表</div><div class="muted">进入店铺后选择具体采集商品</div></div>
    <div v-if="!data?.shops.length" class="card-pad"><div class="empty">还没有店铺。</div></div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead><tr><th>店铺</th><th>渠道</th><th>状态</th><th>商品</th><th>时间</th><th>错误</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="shop in data.shops" :key="shop.id">
            <td><div class="stack"><NuxtLink :to="`/admin/shops/${shop.id}`"><strong>{{ shop.name }}</strong></NuxtLink><span class="muted">{{ shop.baseUrl }}/shop/{{ shop.token }}</span></div></td>
            <td><span class="pill">{{ shop.channel }}</span></td>
            <td><span :class="shop.active ? 'pill ok' : 'pill bad'">{{ shop.active ? 'ACTIVE' : 'PAUSED' }}</span></td>
            <td><div class="stack"><span>{{ shop._count.listings }} SKU</span><span class="muted">{{ shop._count.categories }} 分类 / {{ shop._count.snapshots }} 快照</span></div></td>
            <td><div class="stack"><span>同步 {{ formatDate(shop.lastSyncedAt) }}</span><span class="muted">采集 {{ formatDate(shop.lastCollectedAt) }}</span></div></td>
            <td class="muted">{{ shop.lastError || '-' }}</td>
            <td class="action-cell"><div class="actions"><NuxtLink :to="`/admin/shops/${shop.id}`" custom v-slot="{ navigate }"><var-button size="small" @click="() => navigate()">管理</var-button></NuxtLink><var-button size="small" :loading="loading.sync[shop.id]" @click="syncShop(shop.id)">同步</var-button><var-button size="small" type="primary" :loading="loading.collect[shop.id]" @click="collectShop(shop.id)">采集</var-button></div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <div class="card-header"><div class="card-title">最近任务</div><div class="muted">同步、手动采集和定时采集都会记录</div></div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>时间</th><th>店铺</th><th>类型</th><th>状态</th><th>结果</th></tr></thead>
        <tbody>
          <tr v-for="run in data?.recentRuns || []" :key="run.id">
            <td>{{ formatDate(run.startedAt) }}</td><td>{{ run.shop?.name || '-' }}</td><td><span class="pill">{{ run.type }}</span></td><td><span :class="statusClass(run.status)">{{ run.status }}</span></td><td class="muted">{{ run.error || run.message || `${run.itemsSeen}/${run.snapshotsCreated}` }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <var-snackbar v-model:show="notice.show" :type="notice.type">{{ notice.message }}</var-snackbar>
</template>

<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const { data, refresh } = await useFetch<any>("/api/admin/overview", { credentials: "include" });
const loading = reactive({ create: false, sync: {} as Record<string, boolean>, collect: {} as Record<string, boolean> });
const form = reactive({ shopUrl: "", channel: "ldxp", name: "", token: "", baseUrl: "https://pay.ldxp.cn", intervalMinutes: 10 });
const channelOptions = [{ label: "LDXP", value: "ldxp" }, { label: "CatFK", value: "catfk" }];
const channelDefaultBaseUrls: Record<ShopChannel, string> = { ldxp: "https://pay.ldxp.cn", catfk: "https://catfk.com" };
type NoticeType = "success" | "error";
type ShopChannel = "ldxp" | "catfk";
type ParsedShopUrl = { channel: ShopChannel; token: string; baseUrl: string };
const notice = reactive<{ show: boolean; type: NoticeType; message: string }>({ show: false, type: "success", message: "" });
const apiFetch = $fetch as <T = any>(request: string, options?: any) => Promise<T>;
const parsedShopUrl = computed(() => parseShopUrlInput(form.shopUrl));
const usingShopUrl = computed(() => Boolean(parsedShopUrl.value));

watch(parsedShopUrl, (parsed) => {
  if (parsed) applyParsedShopUrl(parsed);
}, { immediate: true });

watch(() => form.channel, (channel) => {
  if (usingShopUrl.value) return;
  if (!form.baseUrl || Object.values(channelDefaultBaseUrls).includes(form.baseUrl)) {
    form.baseUrl = channelDefaultBaseUrls[channel as ShopChannel];
  }
});

function inferChannelFromHost(hostname: string): ShopChannel {
  return hostname.toLowerCase().includes("catfk.com") ? "catfk" : "ldxp";
}

function parseShopUrlInput(value: string): ParsedShopUrl | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/(?:shop|item)\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    return { channel: inferChannelFromHost(url.hostname), token: match[1], baseUrl: `${url.protocol}//${url.host}` };
  } catch {
    return null;
  }
}

function applyParsedShopUrl(parsed: ParsedShopUrl) {
  form.channel = parsed.channel;
  form.token = parsed.token;
  form.baseUrl = parsed.baseUrl;
}

function normalizeCreateShopForm() {
  const parsed = parsedShopUrl.value;
  if (parsed) applyParsedShopUrl(parsed);
}

function showNotice(message: string, type: NoticeType = "success") { notice.message = message; notice.type = type; notice.show = true; }
function formatDate(value?: string | Date | null) { return value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "-"; }
function statusClass(status: string) { return status === "success" ? "pill ok" : status === "failed" ? "pill bad" : "pill warn"; }
async function callAction<T>(fn: () => Promise<T>) { try { const result: any = await fn(); showNotice(result?.message || "操作完成"); await refresh(); return result; } catch (error: any) { showNotice(error?.data?.message || error?.statusMessage || "操作失败", "error"); } }
async function createShop() { loading.create = true; try { normalizeCreateShopForm(); const result: any = await callAction(() => apiFetch("/api/admin/shops", { method: "POST", body: form })); if (result?.shopId) await navigateTo(`/admin/shops/${result.shopId}`); } finally { loading.create = false; } }
async function syncShop(id: string) { loading.sync[id] = true; try { await callAction(() => apiFetch(`/api/admin/shops/${id}/sync`, { method: "POST" })); } finally { loading.sync[id] = false; } }
async function collectShop(id: string) { loading.collect[id] = true; try { await callAction(() => apiFetch(`/api/admin/shops/${id}/collect`, { method: "POST" })); } finally { loading.collect[id] = false; } }
</script>
