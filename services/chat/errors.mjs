/** A host-checked failure whose message is safe to show the model (the agent's ConfigurationError). Any other
 * error reaches the model only as TOOL_FAILED_INSPECT_BEFORE_RETRY. */
export class ToolError extends Error {
 constructor(message){super(message);this.name='ToolError';}
}
/** A turn failure with one of the fixed §3.5 codes; detail goes to the service log only. */
export class TurnError extends Error {
 constructor(code,detail=code){super(code);this.name='TurnError';this.code=code;this.detail=detail;}
}
export const TURN_CODES=Object.freeze(['MODEL_UNAVAILABLE','MODEL_TIMEOUT','TOOL_ROUNDS_EXCEEDED','GROUNDING_EXCEEDED','TURN_TIMEOUT','PROMPT_BLOCKED','INTERNAL']);
