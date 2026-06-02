# Markscan

商品价格采集与监控系统。支持 LDXP / CatFK 发卡站，通过后台配置店铺 URL 或 token、同步商品、启用指定 SKU 后持续写入价格/库存快照。

默认会优先展示并自动采集新同步商品中命中这些关键词的商品：`team`、`plus`、`日抛`。

价格看板：

```text
http://localhost:18888/market
```

## 本地运行

```bash
npm install
# 先准备 PostgreSQL，并在 .env 中配置 DATABASE_URL
npx prisma migrate dev
npm run dev
```

后台地址：

```text
http://localhost:18888/admin
```

Nuxt 后台按钮通过 API 局部更新和 Varlet Snackbar 提示，不再使用整页刷新的 Server Actions。

首次访问后台会进入初始化页面，创建管理员账号后即可添加店铺。

Nuxt 后端默认会启动内置定时采集器：每分钟只采集一个启用中的店铺，并按最近采集尝试时间从旧到新轮询。

如需单独运行定时采集 worker：

```bash
npm run collector:dev
```

独立 worker 与内置采集器不要同时运行。需要禁用内置采集器时，在 Web 进程环境变量中设置：

```env
MARKSCAN_DISABLE_EMBEDDED_COLLECTOR="1"
```

## 数据库与登录配置

默认数据库为 PostgreSQL。`.env` 中至少配置：

```env
DATABASE_URL="postgresql://markscan:password@localhost:5432/markscan?schema=public"
```

`AUTH_SECRET` 可选。未配置时系统会自动生成并保存到数据库；生产环境也可以显式配置：

```env
AUTH_SECRET="replace-with-64-hex-random-secret"
```

`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` 仅作为旧部署兼容项。新部署推荐通过首次使用页面创建管理员。如需生成兼容密码哈希：

```bash
node -e "const crypto=require('crypto'); const password=process.argv[1]; const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(password, salt, 32).toString('hex'); console.log('scrypt:' + salt + ':' + hash);" "your-password"
```

## Docker 公网部署

Docker 会自动启动 PostgreSQL、执行 Prisma migration、启动 Web 和 collector。可选创建 `.env` 修改数据库密码：

```env
POSTGRES_DB="markscan"
POSTGRES_USER="markscan"
POSTGRES_PASSWORD="change-this-password"
AUTH_SECRET="replace-with-64-hex-random-secret"
```

启动：

```bash
docker compose up -d --build
```

服务：

```text
web       Nuxt + Varlet 后台和价格看板，宿主机监听 18888
collector 定时采集 worker
postgres  PostgreSQL 数据库
```

PostgreSQL 数据会保存在 Docker volume：

```text
postgres_data
```

健康检查：

```text
http://your-domain/api/health
```

## VPS 直接部署（非 Docker）

服务器要求：Node.js 20/22/24 LTS、PostgreSQL 14+。生产安装建议使用锁文件：

`.env` 至少配置：

```env
NODE_ENV="production"
HOST="127.0.0.1"
PORT="18888"
DATABASE_URL="postgresql://markscan:strong-password@127.0.0.1:5432/markscan?schema=public"
AUTH_SECRET="replace-with-64-hex-random-secret"
MARKSCAN_COOKIE_SECURE="1"
```

如果还没启用 HTTPS、只是 HTTP 反代测试登录，把 `MARKSCAN_COOKIE_SECURE` 临时设为 `0`，否则浏览器会拒收 Secure 登录 Cookie，表现为登录后又回到登录页。正式启用 HTTPS 后应改回 `1`。

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start
```

默认 Web 进程会启动内置采集器，每分钟轮询一个启用店铺。单机单进程部署时不需要再开独立 worker。

如果需要单独运行采集 worker，先在 Web 进程环境变量中禁用内置采集器：

```env
MARKSCAN_DISABLE_EMBEDDED_COLLECTOR="1"
```

然后另开一个常驻进程运行：

```bash
npm run collector
```

生产环境建议用 `pm2` 或 systemd 守护进程，并只执行一次 `npx prisma migrate deploy`。上线后访问健康检查确认数据库可用：

```text
https://your-domain/api/health
```

如果在 Windows 本地打包后上传到 Debian/Ubuntu 服务器，必须重新运行 `npx prisma generate` 并重新构建，或确保 `prisma/schema.prisma` 中包含 `debian-openssl-3.0.x` 的 `binaryTargets`，否则 Prisma Query Engine 会出现平台不匹配。

## 反向代理建议

公网建议用 Nginx/Caddy 反代到 `127.0.0.1:18888`，并启用 HTTPS。后台已经有登录保护，但不要暴露 `.env` 或数据库端口。
