-- Database-level invariants that Prisma schema syntax does not express directly.
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_sla_hours_positive" CHECK ("sla_hours" > 0),
  ADD CONSTRAINT "categories_policy_version_positive" CHECK ("policy_version" > 0);

ALTER TABLE "grievances"
  ADD CONSTRAINT "grievances_title_not_blank" CHECK (length(btrim("title")) BETWEEN 1 AND 150),
  ADD CONSTRAINT "grievances_description_not_blank" CHECK (length(btrim("description")) > 0),
  ADD CONSTRAINT "grievances_location_not_blank" CHECK (length(btrim("location")) > 0),
  ADD CONSTRAINT "grievances_version_positive" CHECK ("version" > 0);

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_end_after_start" CHECK ("ended_at" IS NULL OR "ended_at" >= "assigned_at");
CREATE UNIQUE INDEX "assignments_one_active_per_grievance"
  ON "assignments"("grievance_id") WHERE "ended_at" IS NULL;

CREATE UNIQUE INDEX "category_handlers_one_active_primary"
  ON "category_handlers"("category_id") WHERE "is_primary" = true AND "active_to" IS NULL;

CREATE UNIQUE INDEX "resolution_cycles_one_current_per_grievance"
  ON "resolution_cycles"("grievance_id") WHERE "is_current" = true;
ALTER TABLE "resolution_cycles"
  ADD CONSTRAINT "resolution_cycles_cycle_positive" CHECK ("cycle_number" > 0),
  ADD CONSTRAINT "resolution_cycles_remarks_not_blank" CHECK (length(btrim("remarks")) > 0),
  ADD CONSTRAINT "resolution_cycles_feedback_after_resolution" CHECK ("feedback_deadline" >= "resolved_at");

ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_rating_between_one_and_five" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "feedback_comment_length" CHECK ("comment" IS NULL OR length("comment") <= 4000);

ALTER TABLE "escalations"
  ADD CONSTRAINT "escalations_level_positive" CHECK ("level" > 0),
  ADD CONSTRAINT "escalations_reason_not_blank" CHECK (length(btrim("reason")) > 0);

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_attempt_count_nonnegative" CHECK ("attempt_count" >= 0);

ALTER TABLE "job_runs"
  ADD CONSTRAINT "job_runs_counts_nonnegative" CHECK (
    "checked_count" >= 0 AND "succeeded_count" >= 0 AND "skipped_count" >= 0 AND "failed_count" >= 0
  );

CREATE FUNCTION reject_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; write a compensating event instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "status_history_append_only"
  BEFORE UPDATE OR DELETE ON "status_history"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
