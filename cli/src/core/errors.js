// Stable error codes shared by the library, CLI and server. Messages stay human-readable; codes are for clients.
export const ERROR_CODES = {
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  EDITED_OUTPUT: 'EDITED_OUTPUT',
  APPROVED_LOCKED: 'APPROVED_LOCKED',
  CANCELLED: 'CANCELLED',
  STAGE_FAILED: 'STAGE_FAILED',
  VALIDATION: 'VALIDATION',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  PROJECT_LOCKED: 'PROJECT_LOCKED',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL: 'INTERNAL',
};

export class FableonError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FableonError';
    this.code = code ?? ERROR_CODES.INTERNAL;
    this.details = details ?? {};
  }
  toJSON() { return { code: this.code, message: this.message, details: this.details }; }
}

export const fableonError = (code, message, details) => new FableonError(code, message, details);

export function asFableonError(e, fallbackCode = ERROR_CODES.INTERNAL) {
  if (e instanceof FableonError) return e;
  const code = e?.code && Object.values(ERROR_CODES).includes(e.code) ? e.code : fallbackCode;
  return new FableonError(code, e?.message ?? String(e), e?.details ?? {});
}

export function validationError(schema, errors) {
  const list = (errors ?? []).map((e) => typeof e === 'string' ? e : `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  const err = new FableonError(ERROR_CODES.VALIDATION, `${schema} validation failed${list.length ? `:\n${list.join('\n')}` : ''}`, { schema, errors: list });
  err.validation = errors;
  return err;
}

/** Print an error the way the CLI always has; structured data stays in the error object. */
export function printError(e) {
  const err = asFableonError(e);
  console.error(`fableon: ${err.message}`);
  return err;
}
