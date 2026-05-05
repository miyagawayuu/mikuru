export class AppError extends Error {
  constructor(
    message: string,
    readonly code = "APP_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  return fallback;
}
