-- Case messages are the durable conversational and investigation record.
-- Corrections should be represented by a new message rather than rewriting history.
CREATE TRIGGER "case_messages_append_only"
  BEFORE UPDATE OR DELETE ON "case_messages"
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
