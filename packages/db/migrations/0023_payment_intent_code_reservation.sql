-- A transfer code stays taken for a week after its QR ran out (expired, settled or
-- withdrawn), so a late transfer for an old QR waits for a person instead of paying the
-- next order that shows the code. The check reads every intent of the tenant with that
-- code, whatever its status; the live-code index only covers pending ones.
CREATE INDEX payment_intent_tenant_id_content_code_idx ON payment_intent (tenant_id, content_code);
