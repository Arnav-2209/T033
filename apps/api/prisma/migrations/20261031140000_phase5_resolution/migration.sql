-- The one-current-cycle index and rating-range check are established by the
-- foundation integrity migration. This migration adds the timeout scan index.
CREATE INDEX "resolution_cycles_expired_feedback_idx"
  ON "resolution_cycles" ("feedback_deadline")
  WHERE "is_current" = TRUE AND "closed_at" IS NULL;
