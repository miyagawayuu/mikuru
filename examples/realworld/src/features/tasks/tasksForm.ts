import { hasFieldErrors, required, type FieldErrors, type ValidationResult } from "../../lib/form.js";
import type { CreateTaskInput } from "./tasksTypes.js";

export function validateCreateTaskInput(input: CreateTaskInput): ValidationResult<CreateTaskInput> {
  const values = {
    ...input,
    title: input.title.trim()
  };
  const fieldErrors: FieldErrors<CreateTaskInput> = {
    title: required(values.title, "Enter a task title")
  };

  if (hasFieldErrors(fieldErrors)) {
    return { valid: false, fieldErrors };
  }

  return { valid: true, values };
}
