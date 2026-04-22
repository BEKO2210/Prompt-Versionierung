// Typed domain errors. Services throw these; server actions translate them
// to HTTP-equivalent responses. No silent catches allowed.

export class DomainError extends Error {
  public readonly code: string;
  public readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string, id?: string) {
    super("not_found", id ? `${what} not found: ${id}` : `${what} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("conflict", message, 409);
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  public readonly details: Record<string, string> | undefined;
  constructor(message: string, details?: Record<string, string>) {
    super("validation", message, 422);
    this.details = details;
    this.name = "ValidationError";
  }
}

export class ImmutableViolationError extends DomainError {
  constructor(what: string) {
    super("immutable", `Cannot mutate immutable entity: ${what}`, 409);
    this.name = "ImmutableViolationError";
  }
}

export class IllegalTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super("illegal_transition", `Illegal status transition: ${from} → ${to}`, 409);
    this.name = "IllegalTransitionError";
  }
}

export class LineageError extends DomainError {
  constructor(message: string) {
    super("lineage", message, 409);
    this.name = "LineageError";
  }
}

export class PromotionError extends DomainError {
  constructor(message: string) {
    super("promotion", message, 409);
    this.name = "PromotionError";
  }
}
