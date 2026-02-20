-- CreateTable
CREATE TABLE "UserContext" (
    "userId" TEXT NOT NULL,
    "browserbaseContextId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContext_pkey" PRIMARY KEY ("userId")
);
