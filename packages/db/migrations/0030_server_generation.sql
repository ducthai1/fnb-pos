-- Which life of the database a till is talking to. A restore from backup brings every row
-- back to the moment of the backup, while the tills keep what they did since: commands the
-- server had taken after that moment (and so forgot), a device_seq ahead of the server's
-- ledger, a feed cursor ahead of change_seq. A till that meets a generation other than the
-- one it last saw knows the server forgot, sends again what it still holds and pulls the
-- feed from the start. The generation is drawn here, when the database is first migrated,
-- and drawn again after every restore (ops:restore) or by hand (ops:new-server-generation).
--
-- Global, not a tenant row: a restore takes every tenant back at once. The app role holds
-- no privilege on the table and reads it through an owner function, so nothing the API
-- does can change the value that tells every till to resend.

CREATE SCHEMA fnb_server;
GRANT USAGE ON SCHEMA fnb_server TO PUBLIC;

CREATE TABLE fnb_server.generation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation uuid NOT NULL,
  drawn_at timestamptz NOT NULL
);

INSERT INTO fnb_server.generation (generation, drawn_at) VALUES (gen_random_uuid(), now());

CREATE FUNCTION fnb_server.current_generation() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT generation FROM fnb_server.generation
$$;
