-- A command id belongs to the till that made it. The server answers a command sent again by
-- its id, so with ids unique across the tenant a till that drew an id another till had used
-- (a cloned install, a broken generator, a till probing) was handed that till's answer and
-- its order, and its own sequence stalled on a command it believed applied. Each till now
-- keeps its own ids; a till sending an id another till already used is refused on its own
-- sequence, and the lookup by id alone finds who used it first.
ALTER TABLE applied_command DROP CONSTRAINT applied_command_once;
ALTER TABLE applied_command
  ADD CONSTRAINT applied_command_once_per_device UNIQUE (tenant_id, device_id, command_id);
CREATE INDEX applied_command_tenant_id_command_id_idx ON applied_command (tenant_id, command_id);
