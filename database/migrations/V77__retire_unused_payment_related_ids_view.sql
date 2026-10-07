-- R051 related-list AppSheet trial was reverted in OLTP 1.000206.
-- No retained app or database consumer uses this experimental transport.
-- RESTRICT refuses removal if an unexpected database dependency exists.
-- V75/V76 remain immutable migration history; no financial data is changed.
DROP VIEW public.oltp_payment_related_ids_v1 RESTRICT;
