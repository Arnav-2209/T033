-- Preserve each handler/category assignment period while allowing a later reactivation.
DROP INDEX IF EXISTS "category_handlers_category_id_handler_id_key";

CREATE UNIQUE INDEX "category_handlers_one_active_pair"
  ON "category_handlers" ("category_id", "handler_id")
  WHERE "active_to" IS NULL;

ALTER TABLE "category_handlers"
  ADD CONSTRAINT "category_handlers_active_period_check"
  CHECK ("active_to" IS NULL OR "active_to" > "active_from");

-- Keep the pre-existing one-primary-per-category guard. Its filtered predicate is
-- compatible with historical mapping rows after they are ended.
