-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appearance" JSONB;

-- CreateTable
CREATE TABLE "AppearancePreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppearancePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppearancePreset_userId_createdAt_idx" ON "AppearancePreset"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppearancePreset" ADD CONSTRAINT "AppearancePreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
