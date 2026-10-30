-- A station that has printed tickets cannot be deleted (the tickets point at it), so it used
-- to stay in the station list and in the station choice of every product for ever. Taking it
-- out of use sets archived_at instead: it leaves the list, the choice and the tills' copy of
-- the branch's stations, while the tickets it printed keep pointing at it.
ALTER TABLE station ADD COLUMN archived_at timestamptz;
