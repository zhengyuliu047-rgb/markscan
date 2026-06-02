<template>
  <main class="public-shell">
    <header class="public-topbar">
      <NuxtLink to="/market" class="public-logo">
        <span>MARKSCAN</span>
        <strong>AI 行情</strong>
      </NuxtLink>
      <nav class="public-nav">
        <NuxtLink to="/market">行情</NuxtLink>
        <NuxtLink to="/admin">后台</NuxtLink>
      </nav>
    </header>

    <section class="market-hero">
      <div>
        <div class="eyebrow">Public price board</div>
        <h1>AI 商品价格监控前台</h1>
        <p>只展示已有采集快照的商品；同步目录价不会作为行情价展示。</p>
      </div>
      <form class="market-search" @submit.prevent="search">
        <input v-model="keyword" class="input" placeholder="搜索商品、SKU、店铺" />
        <var-button type="primary" native-type="submit">搜索</var-button>
      </form>
    </section>

    <section class="grid cols-4 market-metrics">
      <div class="metric highlight">
        <div class="label">当前最低价</div>
        <div class="metric-value">{{ money(data?.metrics.lowest?.price) }}</div>
        <div class="muted">{{ data?.metrics.lowest?.title || '暂无可用商品' }}</div>
      </div>
      <div class="metric">
        <div class="label">供应商</div>
        <div class="metric-value">{{ data?.metrics.shopCount || 0 }}</div>
        <div class="muted">启用中的店铺</div>
      </div>
      <div class="metric">
        <div class="label">追踪商品</div>
        <div class="metric-value">{{ data?.metrics.trackedCount || 0 }}</div>
        <div class="muted">已启用 {{ data?.metrics.enabledListingCount || 0 }} / 可用 {{ data?.metrics.availableCount || 0 }}</div>
      </div>
      <div class="metric">
        <div class="label">24h 快照</div>
        <div class="metric-value">{{ data?.metrics.snapshotCount24h || 0 }}</div>
        <div class="muted">最近一天采样数</div>
      </div>
    </section>

    <section class="card market-card">
      <div class="card-header">
        <div>
          <div class="card-title">商品行情</div>
          <div class="muted">数据来自最新采集快照。</div>
        </div>
        <var-button v-if="route.query.q" @click="clearSearch">清空搜索</var-button>
      </div>

      <div v-if="!data?.listings.length" class="card-pad">
        <div class="empty">暂无公开行情。请先在后台启用商品并执行一次采集。</div>
      </div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>商品</th>
              <th>供应商</th>
              <th>分类</th>
              <th>现价</th>
              <th>库存</th>
              <th>变化</th>
              <th>采样</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.listings" :key="item.id">
              <td>
                <div class="stack">
                  <strong>{{ item.displayName }}</strong>
                  <span class="muted">{{ item.title }}</span>
                  <span class="actions">
                    <span class="pill">{{ item.goodsKey }}</span>
                    <span v-if="item.priorityLabel" class="pill ok">{{ item.priorityLabel }}</span>
                  </span>
                </div>
              </td>
              <td>
                <div class="stack">
                  <span>{{ item.shopName }}</span>
                  <span class="pill">{{ item.shopChannel }}</span>
                </div>
              </td>
              <td><span class="pill">{{ item.categoryName }}</span></td>
              <td><span class="price">{{ money(item.latestPrice) }}</span></td>
              <td>
                <span :class="item.latestAvailable ? 'pill ok' : 'pill bad'">
                  {{ item.latestAvailable ? item.latestStock ?? '未知' : '下架/缺货' }}
                </span>
              </td>
              <td>
                <span v-if="item.change === null" class="muted">-</span>
                <span v-else :class="item.change <= 0 ? 'pill ok' : 'pill warn'">{{ item.change > 0 ? '+' : '' }}{{ item.change }}</span>
              </td>
              <td>{{ formatDate(item.sampledAt) }}</td>
              <td><a class="pill" :href="item.link" target="_blank" rel="noreferrer">查看</a></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card market-card">
      <div class="card-header">
        <div class="card-title">最近采样</div>
        <div class="muted">用于检查采集是否持续运行。</div>
      </div>
      <div class="snapshot-strip">
        <div v-if="!data?.recentSnapshots.length" class="empty">暂无采样记录。</div>
        <div v-for="snapshot in data?.recentSnapshots" v-else :key="snapshot.id" class="snapshot-card">
          <div class="label">{{ formatDate(snapshot.sampledAt) }}</div>
          <strong>{{ snapshot.title }}</strong>
          <div class="muted">{{ snapshot.shopName }}</div>
          <div class="price">{{ snapshot.isAvailable ? money(snapshot.price) : '下架/缺货' }}</div>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const keyword = ref(String(route.query.q ?? ""));
const { data, refresh } = await useFetch<any>("/api/market", { query: computed(() => ({ q: route.query.q || "" })) });

function money(value?: number | null) {
  return value === null || value === undefined ? "-" : `¥${value}`;
}

function formatDate(value?: string | Date | null) {
  if (!value) return "等待采样";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function search() {
  await router.push({ path: "/market", query: keyword.value.trim() ? { q: keyword.value.trim() } : {} });
  await refresh();
}

async function clearSearch() {
  keyword.value = "";
  await router.push("/market");
  await refresh();
}
</script>
