-- Compaction of the change feed. change_log grew for ever: every save of an order, every
-- edit of a product (once per branch) stays a row. A till only ever needs, for each row it
-- holds, the newest copy after its cursor, so a copy that a newer copy of the same row (same
-- branch, entity and id) has replaced can go once it is old: a till with any cursor still
-- receives the newest copy of everything that changed after it, tombstones included, and
-- nothing that is the only copy of a row is ever removed. Nothing else reads past copies
-- (0042's backfill ran once, at its own migration).
--
-- The feed stays append-only for everyone but the compaction: the app role holds no DELETE
-- on it, and the owner's statement trigger refuses a delete unless the owner function below
-- is running in that transaction. The function runs as the owner, still under the table's
-- forced row level security, so it only ever sees the tenant the caller opened.

CREATE INDEX change_log_entity_copies_idx
  ON change_log (tenant_id, branch_id, entity, entity_id, change_seq);

CREATE FUNCTION refuse_change_log_change_outside_compaction() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('fnb.change_log_compaction', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER change_log_append_only ON change_log;
CREATE TRIGGER change_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON change_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_change_log_change_outside_compaction();
REVOKE EXECUTE ON FUNCTION refuse_change_log_change_outside_compaction() FROM PUBLIC;

-- Removes up to p_limit copies of the open tenant's feed made before p_older_than that a
-- newer copy of the same row has replaced, oldest first; answers how many went. Small batches
-- keep each transaction short while tills pull and write.
CREATE FUNCTION compact_change_log(p_older_than timestamptz, p_limit integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  removed integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'compact_change_log takes 1 to 10000 rows at a time, not %', p_limit;
  END IF;
  PERFORM set_config('fnb.change_log_compaction', 'on', true);
  DELETE FROM public.change_log
  WHERE id IN (
    SELECT c.id FROM public.change_log c
    WHERE c.created_at < p_older_than
      AND EXISTS (
        SELECT 1 FROM public.change_log n
        WHERE n.tenant_id = c.tenant_id AND n.branch_id = c.branch_id
          AND n.entity = c.entity AND n.entity_id = c.entity_id
          AND n.change_seq > c.change_seq
      )
    ORDER BY c.change_seq
    LIMIT p_limit
  );
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('fnb.change_log_compaction', 'off', true);
  RETURN removed;
END;
$$;
