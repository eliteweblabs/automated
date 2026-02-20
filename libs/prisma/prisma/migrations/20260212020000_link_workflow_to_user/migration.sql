-- Update existing Workflow.userId from email strings to integer User IDs
UPDATE "Workflow" w
SET "userId" = u."id"::text
FROM "User" u
WHERE w."userId" = u."email";

-- Delete orphaned workflows with no matching user (userId is becoming required)
DELETE FROM "Workflow"
WHERE "userId" IS NULL
   OR "userId" NOT IN (SELECT "id"::text FROM "User");

-- AlterTable - Change Workflow.userId column from String to Int, make NOT NULL
ALTER TABLE "Workflow" ALTER COLUMN "userId" TYPE INTEGER USING "userId"::integer;
ALTER TABLE "Workflow" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey for Workflow
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate UserContext: add new id column, convert userId from string to int
-- First, create a temp table with the new schema
CREATE TABLE "UserContext_new" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "browserbaseContextId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Migrate existing data (resolve string userId to User.id via email match)
INSERT INTO "UserContext_new" ("userId", "browserbaseContextId", "createdAt", "updatedAt")
SELECT u."id", uc."browserbaseContextId", uc."createdAt", uc."updatedAt"
FROM "UserContext" uc
JOIN "User" u ON uc."userId" = u."email";

-- Drop old table and rename new one
DROP TABLE "UserContext";
ALTER TABLE "UserContext_new" RENAME TO "UserContext";

-- Add unique constraint on userId
CREATE UNIQUE INDEX "UserContext_userId_key" ON "UserContext"("userId");

-- AddForeignKey for UserContext
ALTER TABLE "UserContext" ADD CONSTRAINT "UserContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
