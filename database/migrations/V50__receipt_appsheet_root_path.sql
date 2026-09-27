-- R046: AppSheet native GCS retrieval requires a bucket-root // display reference.
CREATE OR REPLACE FUNCTION public.attach_payment_receipt_evidence(
 p_payment text,p_receipt text,p_key text,p_captured timestamptz,p_expected jsonb,
 p_operation uuid,p_code_version text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE before_value public."Payments"%ROWTYPE; after_value public."Payments"%ROWTYPE;
 local_capture timestamp; environment text; fields text[]:=ARRAY['IG Receipt ID','Receipt Image','Receipt Received At'];
BEGIN
 IF session_user<>'mw_receipt_projector' THEN RAISE EXCEPTION 'Dedicated receipt projector required'; END IF;
 environment:=CASE current_database() WHEN 'loan_manager_dev' THEN 'dev' WHEN 'loan_manager_prod' THEN 'prod' END;
 IF environment IS NULL OR p_receipt IS NULL OR p_receipt !~ '^[0-9a-f]{64}$'
  OR p_captured IS NULL OR NOT isfinite(p_captured) OR p_expected IS NULL
  OR p_operation IS NULL OR nullif(p_code_version,'') IS NULL THEN
  RAISE EXCEPTION 'Invalid receipt projection';
 END IF;
 IF p_key IS NULL OR p_key !~ ('^receipts/'||environment||'/[0-9]{4}/[0-9]{2}/[0-9]{2}/'||p_receipt||'/[0-9a-f]{64}\.(jpg|png|webp)$') THEN
  RAISE EXCEPTION 'Invalid receipt object key';
 END IF;
 SELECT * INTO before_value FROM public."Payments" WHERE "Row ID"=p_payment FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receipt payment missing'; END IF;
 IF (before_value."Status"='Posted'
  AND before_value."Ref Borrower"=p_expected->>'borrower'
  AND before_value."Amount Received"::numeric=(p_expected->>'amount')::numeric
  AND before_value."Amount Received"::numeric=(SELECT coalesce(sum("Principal Paid"::numeric+"Interest Paid"::numeric),0) FROM public."Repayments" WHERE "Ref Payment"=p_payment)
  AND before_value."Payment Date"=(p_expected->>'date')::date
  AND to_char(before_value."Created At",'YYYY-MM-DD HH24:MI')=p_expected->>'clock'
  AND before_value."Bank Reference"=p_expected->>'reference'
  AND before_value."Ref Received By Cash Account"=p_expected->>'account') IS NOT TRUE THEN
  RAISE EXCEPTION 'Receipt payment verification conflict';
 END IF;
 local_capture:=p_captured AT TIME ZONE 'Asia/Bangkok';
 IF (before_value."IG Receipt ID",before_value."Receipt Image",before_value."Receipt Received At")
  IS NOT DISTINCT FROM (p_receipt,'//'||p_key,local_capture) THEN RETURN 'already_applied'; END IF;
 IF before_value."IG Receipt ID" IS NOT NULL THEN RAISE EXCEPTION 'Receipt primary already assigned'; END IF;
 INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version)
 VALUES(p_operation,'receipt-projector','service:receipt-projector',p_receipt,'atomic: attach verified receipt evidence',
  jsonb_build_array(jsonb_build_object('table','Payments','key',p_payment)),p_code_version);
 UPDATE public."Payments" SET "IG Receipt ID"=p_receipt,"Receipt Image"='//'||p_key,"Receipt Received At"=local_capture
  WHERE "Row ID"=p_payment RETURNING * INTO after_value;
 -- Existing row guards may run; absolutely no other persisted field may change.
 IF to_jsonb(before_value)-fields IS DISTINCT FROM to_jsonb(after_value)-fields THEN
  RAISE EXCEPTION 'Receipt projection changed business values';
 END IF;
 INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
 VALUES(p_operation,'public','Payments','UPDATE',jsonb_build_object('Row ID',p_payment),
  jsonb_build_object('IG Receipt ID',before_value."IG Receipt ID",'Receipt Image',before_value."Receipt Image",'Receipt Received At',before_value."Receipt Received At"),
  jsonb_build_object('IG Receipt ID',p_receipt,'Receipt Image','//'||p_key,'Receipt Received At',local_capture));
 RETURN 'applied';
END $$;
COMMENT ON COLUMN public."Payments"."Receipt Image" IS 'Bucket-root AppSheet GCS reference: // followed by the immutable object key';

