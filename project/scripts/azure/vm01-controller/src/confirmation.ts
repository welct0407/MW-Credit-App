// The same alphabet is enforced by the API and HTML's Unicode-sets (v) pattern.
export const APPROVAL_REFERENCE_PATTERN = String.raw`[A-Za-z0-9][A-Za-z0-9_.:\/\-]{0,127}`;
const reference = new RegExp(`^(?:${APPROVAL_REFERENCE_PATTERN})$`, 'u');
// Require the full value: JavaScript's $ also matches before a final line break.
export const validApprovalReference = (value: unknown): value is string => typeof value === 'string' && reference.exec(value)?.[0] === value;
