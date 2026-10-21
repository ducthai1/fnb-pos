-- A product's photo, by the name of its file in the tenant's media directory: the SHA-256 of
-- the bytes as they were stored, and the extension of the format their first bytes show.
-- The bytes live on disk, not here; the API checks the file exists in the caller's tenant
-- before a product may name it. Null: the till draws the category's colour and initials.
ALTER TABLE product
  ADD COLUMN image_key text
    CHECK (image_key ~ '^[0-9a-f]{64}\.(jpg|png|webp)$');
