<template>
  <section class="hero">
    <div>
      <div class="eyebrow">{{ shop?.channel }} / {{ shop?.token }}</div>
      <h1>{{ shop?.name || '店铺' }}</h1>
      <p>{{ shop?.baseUrl }}/shop/{{ shop?.token }}</p>
    </div>
    <div class="actions">
      <NuxtLink to="/admin" custom v-slot="{ navigate }"><var-button size="small" @click="() => navigate()">返回</var-button></NuxtLink>
      <var-button size="small" :loading="loading.sync" @click="syncShop">同步商品</var-button>
      <var-button size="small" type="primary" :loading="loading.collect" @click="collectShop">立即采集</var-button>
      <var-button size="small" type="danger" :loading="loading.delete" @click="deleteShop">删除店铺</var-button>
    </div>
  </section>

  <section class="grid cols-3" style="margin-bottom: 16px">
    <div class="metric"><div class="label">Catalog</div><div class="metric-value">{{ shop?.listings.length || 0 }}</div><div class="muted">已同步 SKU</div></div>
    <div class="metric"><div class="label">Tracked</div><div class="metric-value">{{ enabledCount }}</div><div class="muted">已启用采集</div></div>
    <div class="metric"><div class="label">Queue</div><div class="metric-value">5min</div><div class="muted">全局轮询间隔</div></div>
  </section>

  <section class="grid cols-2" style="margin-bottom: 16px">
    <div class="card">
      <div class="card-header"><div class="card-title">店铺配置</div></div>
    <div class="card-pad">
      <form class="grid" @submit.prevent="saveShop">
        <label class="field"><span class="label">名称</span><input v-model="config.name" class="input" required /></label>
        <label class="field"><span class="label">Base URL</span><input v-model="config.baseUrl" class="input" required /></label>
        <label class="inline-form"><input v-model="config.active" type="checkbox" /><span>启用定时采集</span></label>
        <var-button type="primary" native-type="submit" :loading="loading.save">保存配置</var-button>
      </form>
    </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">分类</div><div class="muted">同步商品后自动生成</div></div>
      <div class="card-pad">
        <div v-if="!shop?.categories.length" class="empty">还没有分类。点击“同步商品”。</div>
        <div v-else class="actions">
          <span v-for="category in shop.categories" :key="category.id" class="pill">{{ category.goodsType }} / {{ category.name }} / {{ category.goodsCount }}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="card" style="margin-bottom: 16px">
    <div class="card-header">
      <div>
        <div class="card-title">商品采集开关</div>
        <div class="muted">目录价仅供后台参考；价格看板以采集快照为准。</div>
      </div>
      <div class="actions">
        <var-button :loading="loading.bulkEnable" @click="bulk('enable')">启用全部</var-button>
        <var-button :loading="loading.bulkDisable" @click="bulk('disable')">停用全部</var-button>
      </div>
    </div>
    <div v-if="shop?.listings.length" class="listing-toolbar">
      <label class="field listing-search">
        <span class="label">商品采集搜索</span>
        <input v-model="listingQuery" class="input" inputmode="search" placeholder="商品名 / 商品 ID / 分类 / 粘贴商品链接" />
      </label>
      <div class="listing-toolbar-meta">
        <span class="pill">显示 {{ filteredListings.length }} / {{ shop.listings.length }}</span>
        <var-button v-if="listingQuery" @click="listingQuery = ''">清空</var-button>
      </div>
    </div>
    <div v-if="!shop?.listings.length" class="card-pad"><div class="empty">还没有商品。先同步店铺商品。</div></div>
    <div v-else-if="!filteredListings.length" class="card-pad"><div class="empty">没有匹配商品，换个关键词试试。</div></div>
    <div v-else>
      <div class="table-wrap listing-table-wrap">
        <table class="table">
          <thead>
            <tr><th>采集状态</th><th>商品</th><th>分类</th><th>目录价</th><th>库存</th><th>标准商品映射</th><th>时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="listing in filteredListings" :key="listing.id">
              <td>
                <div class="collect-cell">
                  <span :class="listing.enabled ? 'collect-status is-enabled' : 'collect-status is-disabled'">{{ listing.enabled ? '采集中' : '已停用' }}</span>
                  <var-button :class="listing.enabled ? 'listing-toggle disable-toggle' : 'listing-toggle enable-toggle'" :loading="loading.toggle[listing.id]" @click="toggleListing(listing)">{{ listing.enabled ? '停用采集' : '启用采集' }}</var-button>
                </div>
              </td>
              <td><div class="stack"><a :href="listing.link" target="_blank" rel="noreferrer"><strong>{{ listing.title }}</strong></a><span class="muted">{{ listing.goodsKey }}</span></div></td>
              <td><span class="pill">{{ listing.category?.name || listing.goodsType }}</span></td>
              <td><span class="price">{{ money(listing.price) }}</span></td>
              <td><span :class="listing.isAvailable ? 'pill ok' : 'pill bad'">{{ listing.stock ?? '未知' }}</span></td>
              <td>
                <form class="inline-form" @submit.prevent="mapListing(listing)">
                  <input v-model="listing.standardProductName" class="input wide-input" placeholder="例如 ChatGPT Plus 日抛" />
                  <var-button native-type="submit" :loading="loading.map[listing.id]">保存</var-button>
                </form>
              </td>
              <td><div class="stack"><span>见到 {{ formatDate(listing.lastSeenAt) }}</span><span class="muted">快照 {{ formatDate(listing.lastSnapshotAt) }}</span></div></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="listing-card-list">
        <article v-for="listing in filteredListings" :key="`mobile-${listing.id}`" class="listing-card">
          <div class="listing-card-top">
            <div class="stack">
              <a :href="listing.link" target="_blank" rel="noreferrer"><strong>{{ listing.title }}</strong></a>
              <span class="muted">{{ listing.goodsKey }}</span>
            </div>
            <span :class="listing.enabled ? 'collect-status is-enabled' : 'collect-status is-disabled'">{{ listing.enabled ? '采集中' : '已停用' }}</span>
          </div>
          <div class="listing-card-meta">
            <span class="pill">{{ listing.category?.name || listing.goodsType }}</span>
            <span class="price">{{ money(listing.price) }}</span>
            <span :class="listing.isAvailable ? 'pill ok' : 'pill bad'">库存 {{ listing.stock ?? '未知' }}</span>
          </div>
          <form class="inline-form listing-card-map" @submit.prevent="mapListing(listing)">
            <input v-model="listing.standardProductName" class="input" placeholder="标准商品映射" />
            <var-button native-type="submit" :loading="loading.map[listing.id]">保存</var-button>
          </form>
          <div class="listing-card-actions">
            <var-button :class="listing.enabled ? 'listing-toggle disable-toggle' : 'listing-toggle enable-toggle'" :loading="loading.toggle[listing.id]" @click="toggleListing(listing)">{{ listing.enabled ? '停用采集' : '启用采集' }}</var-button>
          </div>
          <div class="muted listing-card-time">见到 {{ formatDate(listing.lastSeenAt) }} / 快照 {{ formatDate(listing.lastSnapshotAt) }}</div>
        </article>
      </div>
    </div>
  </section>

  <section class="grid cols-2">
    <div class="card">
      <div class="card-header"><div class="card-title">最近快照</div></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>时间</th><th>商品</th><th>价格</th><th>库存</th></tr></thead>
          <tbody>
            <tr v-for="snapshot in data?.recentSnapshots || []" :key="snapshot.id">
              <td>{{ formatDate(snapshot.sampledAt) }}</td><td>{{ snapshot.standardProduct?.name || snapshot.listing.title }}</td><td><span class="price">{{ money(snapshot.price) }}</span></td><td>{{ snapshot.stock ?? '未知' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><div class="card-title">任务记录</div></div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>时间</th><th>类型</th><th>状态</th><th>结果</th></tr></thead>
          <tbody>
            <tr v-for="run in data?.recentRuns || []" :key="run.id">
              <td>{{ formatDate(run.startedAt) }}</td><td><span class="pill">{{ run.type }}</span></td><td><span :class="statusClass(run.status)">{{ run.status }}</span></td><td class="muted">{{ run.error || run.message || `${run.itemsSeen}/${run.snapshotsCreated}` }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <var-snackbar v-model:show="notice.show" :type="notice.type">{{ notice.message }}</var-snackbar>
</template>

<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

const route = useRoute();
const id = String(route.params.id);
const { data, refresh } = await useFetch<any>(`/api/admin/shops/${id}`, { credentials: "include" });
let refreshTimer: ReturnType<typeof setInterval> | null = null;
type NoticeType = "success" | "error";
const notice = reactive<{ show: boolean; type: NoticeType; message: string }>({ show: false, type: "success", message: "" });
const config = reactive({ name: "", baseUrl: "", active: true });
const loading = reactive({
  save: false,
  sync: false,
  collect: false,
  delete: false,
  bulkEnable: false,
  bulkDisable: false,
  toggle: {} as Record<string, boolean>,
  map: {} as Record<string, boolean>
});
const apiFetch = $fetch as <T = any>(request: string, options?: any) => Promise<T>;
const listingQuery = ref("");

const shop = computed(() => data.value?.shop);
const enabledCount = computed(() => shop.value?.listings.filter((item: any) => item.enabled).length || 0);
const filteredListings = computed(() => {
  const listings = shop.value?.listings || [];
  const terms = getSearchTerms(listingQuery.value);
  if (!terms.length) return listings;
  return listings.filter((listing: any) => {
    const haystack = normalizeSearch([
      listing.title,
      listing.goodsKey,
      listing.goodsType,
      listing.link,
      listing.category?.name,
      listing.standardProduct?.name,
      listing.standardProductName
    ].join(" "));
    return terms.some((term) => haystack.includes(term));
  });
});

onMounted(() => {
  refreshTimer = setInterval(() => {
    void refresh();
  }, 30_000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});

watchEffect(() => {
  if (!shop.value) return;
  config.name = shop.value.name;
  config.baseUrl = shop.value.baseUrl;
  config.active = shop.value.active;
  for (const listing of shop.value.listings) {
    listing.standardProductName = listing.standardProduct?.name || "";
  }
});

function showNotice(message: string, type: NoticeType = "success") { notice.message = message; notice.type = type; notice.show = true; }
function normalizeSearch(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function getSearchTerms(value: string) {
  const raw = normalizeSearch(value);
  if (!raw) return [];
  const terms = new Set([raw]);
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/(?:item|shop)\/([^/?#]+)/i);
    if (match?.[1]) terms.add(match[1].toLowerCase());
  } catch {
    const match = raw.match(/\/(?:item|shop)\/([^/?#]+)/i);
    if (match?.[1]) terms.add(match[1].toLowerCase());
  }
  return [...terms];
}
function money(value?: number | null) { return value === null || value === undefined ? "-" : `¥${value}`; }
function formatDate(value?: string | Date | null) { return value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "-"; }
function statusClass(status: string) { return status === "success" ? "pill ok" : status === "failed" ? "pill bad" : "pill warn"; }
async function callAction(fn: () => Promise<any>, options: { refresh?: boolean } = {}) { try { const result = await fn(); showNotice(result?.message || "操作完成"); if (options.refresh !== false) await refresh(); return result; } catch (error: any) { showNotice(error?.data?.message || error?.statusMessage || "操作失败", "error"); } }
async function saveShop() { loading.save = true; try { await callAction(() => apiFetch(`/api/admin/shops/${id}`, { method: "PATCH", body: config })); } finally { loading.save = false; } }
async function deleteShop() {
  if (!confirm("确定要删除该店铺及其所有商品、采集历史和快照数据吗？此操作无法撤销。")) return;
  loading.delete = true;
  try {
    const result = await callAction(() => apiFetch(`/api/admin/shops/${id}`, { method: "DELETE" }));
    if (result?.ok) {
      await navigateTo("/admin");
    }
  } finally {
    loading.delete = false;
  }
}
async function syncShop() { loading.sync = true; try { await callAction(() => apiFetch(`/api/admin/shops/${id}/sync`, { method: "POST" })); } finally { loading.sync = false; } }
async function collectShop() { loading.collect = true; try { await callAction(() => apiFetch(`/api/admin/shops/${id}/collect`, { method: "POST" })); } finally { loading.collect = false; } }
async function bulk(mode: "enable" | "disable") {
  if (mode === "enable") loading.bulkEnable = true; else loading.bulkDisable = true;
  try {
    const result = await callAction(() => apiFetch(`/api/admin/shops/${id}/listings/bulk`, { method: "POST", body: { mode } }), { refresh: false });
    if (result?.ok && shop.value?.listings) {
      const enabled = mode === "enable";
      for (const listing of shop.value.listings) listing.enabled = enabled;
    }
    await refresh();
  } finally {
    if (mode === "enable") loading.bulkEnable = false; else loading.bulkDisable = false;
  }
}
async function toggleListing(listing: any) {
  loading.toggle[listing.id] = true;
  const previous = listing.enabled;
  listing.enabled = !previous;
  try {
    const result = await callAction(() => apiFetch(`/api/admin/listings/${listing.id}/toggle`, { method: "POST" }), { refresh: false });
    if (result?.listing) listing.enabled = result.listing.enabled;
    if (!result?.ok) listing.enabled = previous;
    await refresh();
  } finally {
    loading.toggle[listing.id] = false;
  }
}
async function mapListing(listing: any) { loading.map[listing.id] = true; try { await callAction(() => apiFetch(`/api/admin/listings/${listing.id}/map`, { method: "POST", body: { standardProductName: listing.standardProductName } })); } finally { loading.map[listing.id] = false; } }
</script>
