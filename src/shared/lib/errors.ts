import type { TFunction } from "i18next";

import type { AppError } from "../../bindings";

export function isAppError(value: unknown): value is AppError {
  return typeof value === "object" && value !== null && "code" in value && "detail" in value;
}

/** Translated message for anything thrown by a command, with the raw detail appended. */
export function errorText(t: TFunction, error: unknown): string {
  if (isAppError(error)) {
    const message = t(`errors.${error.code}`);
    return error.detail ? `${message} ${error.detail}` : message;
  }
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return t("errors.internal");
}
