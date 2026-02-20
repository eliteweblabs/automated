-- Create enum for schedule type
CREATE TYPE "WorkflowScheduleType" AS ENUM ('daily', 'interval');

-- Create WorkflowSchedule table
CREATE TABLE "WorkflowSchedule" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "type" "WorkflowScheduleType" NOT NULL,
  "timezone" TEXT NOT NULL,
  "dailyTime" TEXT,
  "dailyDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "intervalMinutes" INTEGER,
  "nextRunAt" TIMESTAMP(3),
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkflowSchedule_pkey" PRIMARY KEY ("id")
);

-- Indexes and constraints
CREATE UNIQUE INDEX "WorkflowSchedule_workflowId_key" ON "WorkflowSchedule"("workflowId");
CREATE INDEX "WorkflowSchedule_enabled_nextRunAt_idx" ON "WorkflowSchedule"("enabled", "nextRunAt");

ALTER TABLE "WorkflowSchedule"
ADD CONSTRAINT "WorkflowSchedule_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
