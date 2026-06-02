-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'ldxp',
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL DEFAULT 'https://pay.ldxp.cn',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "lastSyncedAt" TIMESTAMP(3),
    "lastCollectedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCategory" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "goodsType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "goodsCount" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandardProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyword" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "categoryId" TEXT,
    "standardProductId" TEXT,
    "goodsKey" TEXT NOT NULL,
    "goodsType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "image" TEXT,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "marketPrice" DOUBLE PRECISION,
    "stock" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastSnapshotAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "snapshotsCreated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "standardProductId" TEXT,
    "collectionRunId" TEXT,
    "price" DOUBLE PRECISION,
    "marketPrice" DOUBLE PRECISION,
    "stock" INTEGER,
    "isAvailable" BOOLEAN NOT NULL,
    "raw" TEXT,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_token_key" ON "Shop"("token");

-- CreateIndex
CREATE INDEX "Shop_active_idx" ON "Shop"("active");

-- CreateIndex
CREATE INDEX "Shop_channel_idx" ON "Shop"("channel");

-- CreateIndex
CREATE INDEX "ShopCategory_shopId_idx" ON "ShopCategory"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCategory_shopId_externalId_goodsType_key" ON "ShopCategory"("shopId", "externalId", "goodsType");

-- CreateIndex
CREATE UNIQUE INDEX "StandardProduct_name_key" ON "StandardProduct"("name");

-- CreateIndex
CREATE INDEX "Listing_shopId_idx" ON "Listing"("shopId");

-- CreateIndex
CREATE INDEX "Listing_enabled_idx" ON "Listing"("enabled");

-- CreateIndex
CREATE INDEX "Listing_standardProductId_idx" ON "Listing"("standardProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_shopId_goodsKey_key" ON "Listing"("shopId", "goodsKey");

-- CreateIndex
CREATE INDEX "CollectionRun_shopId_idx" ON "CollectionRun"("shopId");

-- CreateIndex
CREATE INDEX "CollectionRun_startedAt_idx" ON "CollectionRun"("startedAt");

-- CreateIndex
CREATE INDEX "CollectionRun_status_idx" ON "CollectionRun"("status");

-- CreateIndex
CREATE INDEX "PriceSnapshot_shopId_sampledAt_idx" ON "PriceSnapshot"("shopId", "sampledAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_listingId_sampledAt_idx" ON "PriceSnapshot"("listingId", "sampledAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_standardProductId_sampledAt_idx" ON "PriceSnapshot"("standardProductId", "sampledAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_sampledAt_idx" ON "PriceSnapshot"("sampledAt");

-- AddForeignKey
ALTER TABLE "ShopCategory" ADD CONSTRAINT "ShopCategory_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShopCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_standardProductId_fkey" FOREIGN KEY ("standardProductId") REFERENCES "StandardProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_standardProductId_fkey" FOREIGN KEY ("standardProductId") REFERENCES "StandardProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_collectionRunId_fkey" FOREIGN KEY ("collectionRunId") REFERENCES "CollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
