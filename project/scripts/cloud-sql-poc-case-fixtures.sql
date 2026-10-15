-- Isolated POC fixtures. Preserve exact text; do not cast keys to uuid.
BEGIN;
INSERT INTO public.poc_source (id,input_value,revision) VALUES
 ('A1B2C3D4-1111-4222-8333-ABCDEF123456',0,0),
 ('b2C3d4E5-2222-4333-8444-aBcDeF234567',0,0);
INSERT INTO public.poc_projection (id,applied_revision,derived_value) VALUES
 ('A1B2C3D4-1111-4222-8333-ABCDEF123456',0,0),
 ('b2C3d4E5-2222-4333-8444-aBcDeF234567',0,0);
COMMIT;
