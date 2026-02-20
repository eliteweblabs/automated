-- Add humanId to Workflow
ALTER TABLE "Workflow" ADD COLUMN "humanId" TEXT;

-- Backfill humanId from title with uniqueness
WITH normalized AS (
  SELECT
    id,
    NULLIF(
      TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g')),
      ''
    ) AS base
  FROM "Workflow"
),
ranked AS (
  SELECT
    id,
    COALESCE(base, 'workflow-' || SUBSTRING(id FROM 1 FOR 8)) AS base,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(base, 'workflow-' || SUBSTRING(id FROM 1 FOR 8))
      ORDER BY id
    ) AS rn
  FROM normalized
)
UPDATE "Workflow" AS w
SET "humanId" = CASE
  WHEN ranked.rn = 1 THEN ranked.base
  ELSE ranked.base || '-' || ranked.rn
END
FROM ranked
WHERE w.id = ranked.id;

-- Enforce non-null and unique humanId
ALTER TABLE "Workflow" ALTER COLUMN "humanId" SET NOT NULL;
CREATE UNIQUE INDEX "Workflow_humanId_key" ON "Workflow"("humanId");

-- Create enum for inbound email status
CREATE TYPE "InboundEmailStatus" AS ENUM ('received', 'rejected', 'triggered', 'failed');

-- Create InboundEmail table
CREATE TABLE "InboundEmail" (
  "id" TEXT NOT NULL,
  "resendId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "runId" TEXT,
  "from" TEXT NOT NULL,
  "to" TEXT[] NOT NULL,
  "subject" TEXT,
  "messageId" TEXT,
  "receivedAt" TIMESTAMP(3),
  "html" TEXT,
  "text" TEXT,
  "headers" JSONB,
  "attachments" JSONB,
  "status" "InboundEmailStatus" NOT NULL DEFAULT 'received',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- Indexes and constraints for InboundEmail
CREATE UNIQUE INDEX "InboundEmail_resendId_key" ON "InboundEmail"("resendId");
CREATE INDEX "InboundEmail_workflowId_idx" ON "InboundEmail"("workflowId");
CREATE INDEX "InboundEmail_runId_idx" ON "InboundEmail"("runId");

ALTER TABLE "InboundEmail"
ADD CONSTRAINT "InboundEmail_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboundEmail"
ADD CONSTRAINT "InboundEmail_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
