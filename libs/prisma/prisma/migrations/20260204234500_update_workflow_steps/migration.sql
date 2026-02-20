-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('navigate', 'tab_navigate', 'save', 'step', 'extract', 'loop', 'conditional');

-- CreateEnum
CREATE TYPE "WorkflowStepBranch" AS ENUM ('main', 'loop', 'true', 'false');

-- AlterTable
ALTER TABLE "Workflow" DROP COLUMN "rawText";

-- AlterTable
ALTER TABLE "WorkflowStep"
ADD COLUMN     "parentStepId" TEXT,
ADD COLUMN     "branch" "WorkflowStepBranch" NOT NULL DEFAULT 'main',
ADD COLUMN     "type" "WorkflowStepType" NOT NULL DEFAULT 'step',
ADD COLUMN     "url" TEXT,
ADD COLUMN     "dataSchema" TEXT,
ADD COLUMN     "condition" TEXT,
ALTER COLUMN   "description" DROP NOT NULL;

-- Remove default from type column (schema has no default)
ALTER TABLE "WorkflowStep" ALTER COLUMN "type" DROP DEFAULT;

-- DropIndex
DROP INDEX "WorkflowStep_workflowId_stepNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_workflowId_parentStepId_branch_stepNumber_key" ON "WorkflowStep"("workflowId", "parentStepId", "branch", "stepNumber");

-- CreateIndex
CREATE INDEX "WorkflowStep_parentStepId_idx" ON "WorkflowStep"("parentStepId");

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_parentStepId_fkey" FOREIGN KEY ("parentStepId") REFERENCES "WorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
