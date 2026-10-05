-- Preserve the same stored-data rule while exposing nullable column metadata to
-- schema importers. The default and V65 command/permission guards are unchanged.
-- Validate the replacement before removing NOT NULL; Flyway runs this atomically.
ALTER TABLE public."Payments"
 ADD CONSTRAINT payment_delete_requested_present CHECK ("Delete Requested" IS NOT NULL);
ALTER TABLE public."Payments" ALTER COLUMN "Delete Requested" DROP NOT NULL;
