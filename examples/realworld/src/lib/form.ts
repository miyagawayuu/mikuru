export type FieldErrors<TValues> = Partial<Record<keyof TValues, string>>;

export type ValidationResult<TValues> =
  | { valid: true; values: TValues }
  | { valid: false; fieldErrors: FieldErrors<TValues> };

export function required(value: string, message = "This field is required"): string | undefined {
  return value.trim() ? undefined : message;
}

export function hasFieldErrors<TValues>(fieldErrors: FieldErrors<TValues>): boolean {
  return Object.values(fieldErrors).some(Boolean);
}
