/*
  Warnings:

  - You are about to drop the `Interaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Interaction" DROP CONSTRAINT "Interaction_sessionId_fkey";

-- DropIndex
DROP INDEX "BrowserSession_userId_key";

-- AlterTable
ALTER TABLE "BrowserSession" ADD COLUMN     "workflowId" TEXT;

-- DropTable
DROP TABLE "Interaction";

-- CreateIndex
CREATE INDEX "BrowserSession_userId_idx" ON "BrowserSession"("userId");

-- CreateIndex
CREATE INDEX "BrowserSession_workflowId_idx" ON "BrowserSession"("workflowId");
