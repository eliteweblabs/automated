-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL,
    "browserbaseSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrowserSession_browserbaseSessionId_key" ON "BrowserSession"("browserbaseSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserSession_userId_key" ON "BrowserSession"("userId");
