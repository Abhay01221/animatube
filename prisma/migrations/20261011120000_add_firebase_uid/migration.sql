-- Add the Firebase identity link used by /api/auth/sync-user.
-- IF NOT EXISTS keeps this safe for databases where the column was already
-- created manually during the Firebase migration.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "firebaseUid" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_firebaseUid_key"
ON "User"("firebaseUid");
