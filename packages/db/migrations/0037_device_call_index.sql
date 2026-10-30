-- A till's place among the branch's tills (1 to 9), the hundreds digit of the number it calls
-- out when a drink is ready, so two tills of one branch never call the same number. Taken at
-- pairing (the smallest still free in the branch) and given back when the till is revoked.
-- Tills paired before this column existed have none: the API gives each one the next free
-- index the first time it loads its start-up data, so they never have to be paired again.
ALTER TABLE device
  ADD COLUMN call_index smallint
    CONSTRAINT device_call_index_in_range CHECK (call_index BETWEEN 1 AND 9);

CREATE UNIQUE INDEX device_tenant_id_branch_id_call_index_key
  ON device (tenant_id, branch_id, call_index)
  WHERE call_index IS NOT NULL;
