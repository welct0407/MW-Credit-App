/** Borrower display: Thai name - English name; one side may be empty (no dangling separator). Never substitutes an internal ID. */
export function borrowerLabel(name:unknown,description:unknown,fallback='—'){const parts=[name,description].map(value=>value==null?'':String(value).trim()).filter(Boolean);return parts.length?parts.join(' - '):fallback}
