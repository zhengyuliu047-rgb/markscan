-- DropIndex
DROP INDEX "Shop_token_key";

-- CreateIndex
CREATE UNIQUE INDEX "Shop_channel_token_key" ON "Shop"("channel", "token");
