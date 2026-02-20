-- AlterTable: rename outputMarkdown to output and add outputExtension
ALTER TABLE "WorkflowRun" RENAME COLUMN "outputMarkdown" TO "output";
ALTER TABLE "WorkflowRun" ADD COLUMN "outputExtension" TEXT;
