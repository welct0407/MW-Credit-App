/**
 * R077: how long the receiving form waits for slip recognition before it says "Slip not read" (RR-UX-02).
 * Chain: agent recognizer 42 s < command route upstream 45 s (services/receipts/recognizer-client.mjs) < this 60 s.
 * The recognition request uses its own fetch and timer, never call()'s 15 s abort.
 */
export const RECOGNITION_DEADLINE_MS=60000;
