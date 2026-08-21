export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, code, false);
  }
}

export class UnsupportedMediaError extends AppError {
  constructor(message: string) {
    super(message, 'UNSUPPORTED_MEDIA', false);
  }
}

export class InvalidMediaError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_MEDIA', false);
  }
}

export class NotFoundAppError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', false);
  }
}

export class ProviderError extends AppError {
  constructor(
    message: string,
    retryable: boolean,
    retryAfterMs?: number,
    code = 'PROVIDER_ERROR',
  ) {
    super(message, code, retryable, retryAfterMs);
  }
}

export class PermanentProviderError extends ProviderError {
  constructor(message: string, code = 'PROVIDER_PERMANENT_ERROR') {
    super(message, false, undefined, code);
  }
}

export class TransientProviderError extends ProviderError {
  constructor(
    message: string,
    retryAfterMs?: number,
    code = 'PROVIDER_TRANSIENT_ERROR',
  ) {
    super(message, true, retryAfterMs, code);
  }
}
