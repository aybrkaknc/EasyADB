import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";

import { errorText, isAppError } from "./errors";
import { appName, formatBytes, formatDate, percent, prettyPackage } from "./format";

describe("formatBytes", () => {
  it("formats sizes with units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(formatBytes(150 * 1024 ** 3)).toBe("150 GB");
  });

  it("handles missing and invalid values", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(undefined)).toBe("-");
    expect(formatBytes(-1)).toBe("-");
    expect(formatBytes(Number.NaN)).toBe("-");
  });
});

describe("percent", () => {
  it("clamps and guards against zero totals", () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(300, 100)).toBe(100);
  });
});

describe("app names", () => {
  it("prefers the label and falls back to a readable package name", () => {
    expect(appName({ label: "Chrome", package: "com.android.chrome" })).toBe("Chrome");
    expect(appName({ label: null, package: "com.example.my_cool-app" })).toBe("My Cool App");
    expect(prettyPackage("com.foo.camelCaseName")).toBe("Camel Case Name");
  });
});

describe("formatDate", () => {
  it("accepts ISO strings and unix seconds", () => {
    expect(formatDate("2026-01-28T12:00:00+03:00", "en")).toContain("2026");
    expect(formatDate(1_700_000_000, "en")).toContain("2023");
    expect(formatDate("not a date", "en")).toBe("-");
  });
});

describe("errorText", () => {
  const t = ((key: string) => `T(${key})`) as unknown as TFunction;

  it("translates app errors and appends the detail", () => {
    const error = { code: "wrong_password", detail: "" };
    expect(isAppError(error)).toBe(true);
    expect(errorText(t, error)).toBe("T(errors.wrong_password)");
    expect(errorText(t, { code: "adb_failed", detail: "closed" })).toBe(
      "T(errors.adb_failed) closed",
    );
  });

  it("handles strings, errors and unknown values", () => {
    expect(errorText(t, "plain")).toBe("plain");
    expect(errorText(t, new Error("boom"))).toBe("boom");
    expect(errorText(t, 42)).toBe("T(errors.internal)");
  });
});
