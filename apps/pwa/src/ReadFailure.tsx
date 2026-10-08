import React, { useState } from 'react';
export type ReadFailure<Code extends string = string> = { code: Code; reference?: string };
export function responseReference(response: Response): string | undefined {
  const value = response.headers.get('X-Request-ID');
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}
export function ErrorReference({ failure, thai }: { failure: ReadFailure | null; thai: boolean }) {
  const [copyState, setCopyState] = useState<{ reference: string; ok: boolean } | null>(null);
  if (!failure?.reference) return null;
  const reference = failure.reference;
  return <div className="read-error-reference"><span>{thai ? 'รหัสอ้างอิง' : 'Reference'}: <code>{reference}</code></span><button className="secondary-button" onClick={async () => {
    try { await navigator.clipboard.writeText(reference); setCopyState({ reference, ok: true }); }
    catch { setCopyState({ reference, ok: false }); }
  }}>{thai ? 'คัดลอกรหัสอ้างอิง' : 'Copy reference'}</button>{copyState?.reference === reference && <span role="status">{copyState.ok ? (thai ? 'คัดลอกแล้ว' : 'Copied') : (thai ? 'คัดลอกไม่สำเร็จ กรุณาเลือกรหัสเพื่อคัดลอก' : 'Could not copy. Select the reference to copy it.')}</span>}</div>;
}