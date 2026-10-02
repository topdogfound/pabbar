-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'EMAIL_CHANGE');

-- DropIndex
DROP INDEX "OtpChallenge_channel_destination_createdAt_idx";

-- DropIndex
DROP INDEX "Session_userId_lastUsedAt_idx";

-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN     "purpose" "OtpPurpose" NOT NULL DEFAULT 'LOGIN',
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "OtpChallenge_channel_destination_purpose_userId_createdAt_idx" ON "OtpChallenge"("channel", "destination", "purpose", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_idx" ON "OtpChallenge"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_createdAt_id_idx" ON "Session"("userId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
