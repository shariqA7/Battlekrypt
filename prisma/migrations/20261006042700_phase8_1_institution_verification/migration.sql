-- AlterTable
ALTER TABLE "ChallengeApplication" ALTER COLUMN "proofUrls" DROP DEFAULT,
ALTER COLUMN "paymentReceiptUrls" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChallengeDispute" ALTER COLUMN "openerEvidenceUrls" DROP DEFAULT,
ALTER COLUMN "responderEvidenceUrls" DROP DEFAULT;
