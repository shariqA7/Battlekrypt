-- Prize split saved with a tournament template (follow-up to D3).
CREATE TABLE "TemplatePrizeTier" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "positionFrom" INTEGER NOT NULL,
    "positionTo" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "TemplatePrizeTier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TemplatePrizeTier_templateId_idx" ON "TemplatePrizeTier"("templateId");

ALTER TABLE "TemplatePrizeTier" ADD CONSTRAINT "TemplatePrizeTier_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TournamentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
