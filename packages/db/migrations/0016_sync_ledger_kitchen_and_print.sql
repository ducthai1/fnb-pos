-- What till sync records beyond the orders and shifts themselves: who sent each command.

-- The staff member signed in on the till when it sent the command, so "who did this?" is
-- answered from the ledger itself, rejections included (a refused void is evidence too).
-- Null for commands recorded before the column existed: their sender was never stored,
-- and guessing it from sessions could name the wrong person.
ALTER TABLE applied_command
  ADD COLUMN staff_id uuid,
  ADD CONSTRAINT applied_command_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id);
