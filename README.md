# Markscan

AI 商品价格采集后台。当前是 Nuxt + Varlet 前端，支持 LDXP / CatFK 发卡站，通过后台配置店铺 URL 或 token、同步商品、启用指定 SKU 后持续写入价格/库存快照。

默认会优先展示并自动采集新同步商品中命中这些关键词的商品：`team`、`plus`、`日抛`。

公开行情页：

```text
http://localhost:3000/market
```

## 本地运行

```bash
npm install
npx prisma migrate dev
npm run dev
```

后台地址：

```text
http://localhost:3000/admin
```

Nuxt 后台按钮通过 API 局部更新和 Varlet Snackbar 提示，不再使用整页刷新的 Server Actions。

定时采集 worker：

```bash
npm run collector:dev
```

## 登录配置

`.env` 中配置管理员登录：

```env
DATABASE_URL="file:/absolute/path/to/markscan/prisma/dev.db"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="scrypt:<salt>:<hash>"
AUTH_SECRET="replace-with-64-hex-random-secret"
```

本地生产运行建议把 `DATABASE_URL` 写成绝对路径。Docker 部署时 `docker-compose.yml` 会覆盖为 `file:/data/markscan.db`。

当前已按要求配置管理员账号。公网部署前建议重新生成 `AUTH_SECRET`，如需换密码，可用下面命令生成新哈希：

```bash
node -e "const crypto=require('crypto'); const password=process.argv[1]; const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(password, salt, 32).toString('hex'); console.log('scrypt:' + salt + ':' + hash);" "your-password"
```

## Docker 公网部署

准备 `.env`，至少包含：

```env
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="scrypt:<salt>:<hash>"
AUTH_SECRET="replace-with-64-hex-random-secret"
```

启动：

```bash
docker compose up -d --build
```

服务：

```text
web       Next.js 后台，监听 3000
web       Nuxt + Varlet 后台和前台，监听 3000
collector 定时采集 worker
```

SQLite 数据文件会保存在：

```text
./data/markscan.db
```

健康检查：

```text
http://your-domain/api/health
```

## VPS 直接部署

```bash
npm install
npx prisma migrate deploy
npm run build
npm run start
```

另开一个常驻进程运行：

```bash
npm run collector
```

生产环境建议用 `pm2` 或 systemd 同时守护 Web 和 collector。

## 反向代理建议

公网建议用 Nginx/Caddy 反代到 `127.0.0.1:3000`，并启用 HTTPS。后台已经有登录保护，但不要暴露 `.env`、`data/`、`prisma/dev.db` 等文件。
