export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.details = options.details ?? null;
  }
}

export function toAppError(error, fallbackCode = "UNKNOWN_ERROR") {
  if (error instanceof AppError) return error;
  if (error?.name === "AbortError") {
    return new AppError("REQUEST_ABORTED", "The request was cancelled.", { cause: error });
  }
  return new AppError(fallbackCode, error?.message || "An unexpected error occurred.", {
    cause: error,
  });
}
