-- Drafts may be incomplete. Submission validation is repeated in the domain
-- service and guarded by this database constraint for non-draft records.
ALTER TABLE "grievances"
  ALTER COLUMN "case_number" DROP NOT NULL,
  ALTER COLUMN "category_id" DROP NOT NULL,
  ALTER COLUMN "title" DROP NOT NULL,
  ALTER COLUMN "description" DROP NOT NULL,
  ALTER COLUMN "incident_date" DROP NOT NULL,
  ALTER COLUMN "location" DROP NOT NULL;

ALTER TABLE "grievances"
  ADD COLUMN "submission_key" VARCHAR(80),
  ADD COLUMN "sla_hours_snapshot" INTEGER;

CREATE UNIQUE INDEX "grievances_submission_key_key" ON "grievances"("submission_key");
CREATE SEQUENCE "grievance_case_reference_seq" AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

ALTER TABLE "grievances"
  ADD CONSTRAINT "grievances_sla_hours_snapshot_positive"
    CHECK ("sla_hours_snapshot" IS NULL OR "sla_hours_snapshot" > 0),
  ADD CONSTRAINT "grievances_submission_complete"
    CHECK (
      "status" = 'DRAFT'
      OR (
        "case_number" IS NOT NULL
        AND "submission_key" IS NOT NULL
        AND "category_id" IS NOT NULL
        AND "title" IS NOT NULL
        AND length(btrim("title")) BETWEEN 1 AND 150
        AND "description" IS NOT NULL
        AND length(btrim("description")) > 0
        AND "incident_date" IS NOT NULL
        AND "submitted_at" IS NOT NULL
        AND "resolution_deadline" IS NOT NULL
        AND "sla_hours_snapshot" IS NOT NULL
        AND "sla_policy_version" IS NOT NULL
      )
    );
