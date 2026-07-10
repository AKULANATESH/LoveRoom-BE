-- Auth and invitation updates for Together MVP
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

UPDATE "User"
SET
  "username" = CONCAT(SPLIT_PART("email", '@', 1), '_', SUBSTRING("id", 1, 6)),
  "passwordHash" = 'legacy-user-no-password'
WHERE "username" IS NULL OR "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

ALTER TABLE "PartnerInvitation" ADD COLUMN IF NOT EXISTS "inviterId" TEXT;
ALTER TABLE "PartnerInvitation" ADD COLUMN IF NOT EXISTS "inviteeUsername" TEXT;
ALTER TABLE "PartnerInvitation" ADD COLUMN IF NOT EXISTS "code" TEXT;

UPDATE "PartnerInvitation"
SET "code" = UPPER(SUBSTRING(REPLACE("token", '-', ''), 1, 6))
WHERE "code" IS NULL;

ALTER TABLE "PartnerInvitation" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "PartnerInvitation" ALTER COLUMN "inviteeEmail" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerInvitation_code_key" ON "PartnerInvitation"("code");

ALTER TABLE "PartnerInvitation"
  ADD CONSTRAINT "PartnerInvitation_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
