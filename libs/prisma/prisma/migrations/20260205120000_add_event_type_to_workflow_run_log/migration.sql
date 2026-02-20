-- AlterTable
ALTER TABLE "WorkflowRunLog" ADD COLUMN "eventType" TEXT;

-- CreateIndex
CREATE INDEX "WorkflowRunLog_runId_eventType_timestamp_idx" ON "WorkflowRunLog"("runId", "eventType", "timestamp");
