<template>
  <section class="hero">
    <div>
      <div class="eyebrow">{{ shop?.channel }} / {{ shop?.token }}</div>
      <h1>{{ shop?.name || '店铺' }}</h1>
      <p>{{ shop?.baseUrl }}/shop/{{ shop?.token }}</p>
    </div>
    <div class="actions">
      <NuxtLink class="pill" to="/admin">返回</NuxtLink>
      <var-button @click="syncShop">同步商品</var-button>
      <var-button type="primary" @click="collectShop">立即采集</var-button>
    </div>
  </section>

  <section class="grid cols-3" style="margin-bottom: 16px">
    <div class="metric"><div class="label">Catalog</div><div class="metric-value">{{ shop?.listings.length || 0 }}</div><div class="muted">已同步 SKU</div></div>
    <div class="metric"><div class="label">Tracked</div><div class="metric-value">{{ enabledCount }}</div><div class="muted">已启用采集</div></div>
    <div class="metric"><div class="label">Interval</div><div class="metric-value">{{ shop?.intervalMinutes || 0 }}m</div><div class="muted">定时采集间隔</div></div>
  </section>

  <section class="grid cols-2" style="margin-bottom: 16px">
    <div class="card">
      <div class="card-header"><div class="card-title">店铺配置</div></div>
      <div class="card-pad">
        <form class="grid" @submit.prevent="saveShop">
          <label class="field"><span class="label">名称</span><input v-model="config.name" class="input" required /></label>
          <label class="field"><span class="label">Base URL</span><input v-model="config.baseUrl" class="input" required /></label>
          <label class="field"><span class="label">采集间隔分钟</span><input v-model.number="config.intervalMinutes" class="input" type="number" min="1" /></label>
          <label class="inline-form"><input v-model="config.active" type="checkbox" /><span>启用定时采集</span></label>
          <var-button type="primary" native-type="submit">保存配置</var-button>
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
        <div class="muted">同步价只是目录价格；前台行情只展示采集快照。</div>
      </div>
      <div class="actions">
        <var-button @click="bulk('enable')">启用全部</var-button>
        <var-button @click="bulk('disable')">停用全部</var-button>
      </div>
    </div>
    <div v-if="!shop?.listings.length" class="card-pad"><div class="empty">还没有商品。先同步店铺商品。</div></div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>采集</th><th>商品</th><th>分类</th><th>同步价</th><th>库存</th><th>标准商品映射</th><th>时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="listing in shop.listings" :key="listing.id">
            <td><var-button @click="toggleListing(listing.id)">{{ listing.enabled ? '停用' : '启用' }}</var-button></td>
            <td><div class="stack"><a :href="listing.link" target="_blank" rel="noreferrer"><strong>{{ listing.title }}</strong></a><span class="muted">{{ listing.goodsKey }}</span></div></td>
            <td><span class="pill">{{ listing.category?.name || listing.goodsType }}</span></td>
            <td><span class="price">{{ money(listing.price) }}</span></td>
            <td><span :class="listing.isAvailable ? 'pill ok' : 'pill bad'">{{ listing.stock ?? '未知' }}</span></td>
            <td>
              <form class="inline-form" @submit.prevent="mapListing(listing)">
                <input v-model="listing.standardProductName" class="input wide-input" placeholder="例如 ChatGPT Plus 日抛" />
                <var-button native-type="submit">保存</var-button>
              </form>
            </td>
            <td><div class="stack"><span>见到 {{ formatDate(listing.lastSeenAt) }}</span><span class="muted">快照 {{ formatDate(listing.lastSnapshotAt) }}</span></div></td>
          </tr>
        </tbody>
      </table>
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
type NoticeType = "success" | "error";
const notice = reactive<{ show: boolean; type: NoticeType; message: string }>({ show: false, type: "success", message: "" });
const config = reactive({ name: "", baseUrl: "", intervalMinutes: 10, active: true });
const apiFetch = $fetch as <T = any>(request: string, options?: any) => Promise<T>;

const shop = computed(() => data.value?.shop);
const enabledCount = computed(() => shop.value?.listings.filter((item: any) => item.enabled).length || 0);

watchEffect(() => {
  if (!shop.value) return;
  config.name = shop.value.name;
  config.baseUrl = shop.value.baseUrl;
  config.intervalMinutes = shop.value.intervalMinutes;
  config.active = shop.value.active;
  for (const listing of shop.value.listings) {
    listing.standardProductName = listing.standardProduct?.name || "";
  }
});

function showNotice(message: string, type: NoticeType = "success") { notice.message = message; notice.type = type; notice.show = true; }
function money(value?: number | null) { return value === null || value === undefined ? "-" : `¥${value}`; }
function formatDate(value?: string | Date | null) { return value ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "-"; }
function statusClass(status: string) { return status === "success" ? "pill ok" : status === "failed" ? "pill bad" : "pill warn"; }
async function callAction(fn: () => Promise<any>) { try { const result = await fn(); showNotice(result?.message || "操作完成"); await refresh(); return result; } catch (error: any) { showNotice(error?.data?.message || error?.statusMessage || "操作失败", "error"); } }
async function saveShop() { await callAction(() => apiFetch(`/api/admin/shops/${id}`, { method: "PATCH", body: config })); }
async function syncShop() { await callAction(() => apiFetch(`/api/admin/shops/${id}/sync`, { method: "POST" })); }
async function collectShop() { await callAction(() => apiFetch(`/api/admin/shops/${id}/collect`, { method: "POST" })); }
async function bulk(mode: "enable" | "disable") { await callAction(() => apiFetch(`/api/admin/shops/${id}/listings/bulk`, { method: "POST", body: { mode } })); }
async function toggleListing(listingId: string) { await callAction(() => apiFetch(`/api/admin/listings/${listingId}/toggle`, { method: "POST" })); }
async function mapListing(listing: any) { await callAction(() => apiFetch(`/api/admin/listings/${listing.id}/map`, { method: "POST", body: { standardProductName: listing.standardProductName } })); }
</script>
