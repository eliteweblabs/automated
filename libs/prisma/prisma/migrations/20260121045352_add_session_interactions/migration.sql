-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "element" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BrowserSession"("browserbaseSessionId") ON DELETE CASCADE ON UPDATE CASCADE;
