import { describe, expect, it } from "vitest";

import type { LogLine } from "../bindings";
import { canApply, canApplyTo, statusKey, webSearchUrl } from "./debloat/debloat";
import { parentPath } from "./files/paths";
import { compileSearch, filterLines, formatLine, highlight } from "./logcat/filter";
import { complete } from "./terminal/completion";

describe("terminal completion", () => {
  it("completes common commands to their shared prefix", () => {
    expect(complete("dev", [])).toBe("devices -l");
    expect(complete("reboot r", [])).toBe("reboot recovery");
    expect(complete("reboot", [])).toBe(null);
    expect(complete("zzz", [])).toBe(null);
  });

  it("completes package names after commands that take one", () => {
    const packages = ["com.android.chrome", "com.android.camera", "org.mozilla.firefox"];
    expect(complete("shell pm disable-user com.android.ch", packages)).toBe(
      "shell pm disable-user com.android.chrome",
    );
    // Two packages share the typed prefix, so there is nothing more to add.
    expect(complete("uninstall com.android.c", packages)).toBe(null);
    expect(complete("uninstall com", packages)).toBe("uninstall com.android.c");
    expect(complete("uninstall org", packages)).toBe("uninstall org.mozilla.firefox");
  });
});

const line = (level: string, tag: string, message: string): LogLine => ({
  time: "11-23 03:32:01.123",
  pid: 1,
  tid: 2,
  level,
  tag,
  message,
});

describe("logcat filter", () => {
  const lines = [
    line("I", "ActivityManager", "Start proc com.a"),
    line("E", "AndroidRuntime", "FATAL EXCEPTION: main"),
    line("D", "MyApp", "debug value=42"),
  ];

  it("filters by level, tag and regex", () => {
    const all = new Set(["V", "D", "I", "W", "E", "F"]);
    expect(filterLines(lines, { levels: all, tags: "", search: "" })).toHaveLength(3);
    expect(filterLines(lines, { levels: new Set(["E"]), tags: "", search: "" })).toHaveLength(1);
    expect(filterLines(lines, { levels: all, tags: "myapp, activity", search: "" })).toHaveLength(
      2,
    );
    expect(filterLines(lines, { levels: all, tags: "", search: "value=\\d+" })).toHaveLength(1);
  });

  it("ignores an invalid regex instead of hiding everything", () => {
    expect(compileSearch("(")).toBe("invalid");
    expect(compileSearch("  ")).toBe(null);
    const all = new Set(["D", "I", "E"]);
    expect(filterLines(lines, { levels: all, tags: "", search: "(" })).toHaveLength(3);
  });

  it("highlights every match", () => {
    expect(highlight("a1b22c", /\d+/)).toEqual([
      { text: "a", match: false },
      { text: "1", match: true },
      { text: "b", match: false },
      { text: "22", match: true },
      { text: "c", match: false },
    ]);
    expect(highlight("abc", null)).toEqual([{ text: "abc", match: false }]);
  });

  it("formats lines for export", () => {
    expect(formatLine(lines[0]!)).toBe(
      "11-23 03:32:01.123 1 2 I ActivityManager: Start proc com.a",
    );
  });
});

describe("file paths", () => {
  it("returns the parent folder", () => {
    expect(parentPath("/sdcard/Download/x")).toBe("/sdcard/Download");
    expect(parentPath("/sdcard")).toBe("/");
    expect(parentPath("/")).toBe("/");
  });
});

describe("debloat actions", () => {
  const base = { package: "a.b", label: null, system: true, disabled: false, installed: true };
  const removed = { ...base, installed: false };
  const disabled = { ...base, disabled: true };

  it("only offers actions that fit the current state", () => {
    expect(canApply("disable", base)).toBe(true);
    expect(canApply("enable", base)).toBe(false);
    expect(canApply("uninstall", base)).toBe(true);
    expect(canApply("restore", base)).toBe(false);

    expect(canApply("disable", disabled)).toBe(false);
    expect(canApply("enable", disabled)).toBe(true);

    expect(canApply("disable", removed)).toBe(false);
    expect(canApply("enable", removed)).toBe(false);
    expect(canApply("uninstall", removed)).toBe(false);
    expect(canApply("restore", removed)).toBe(true);
  });

  it("never offers to disable or remove protected packages", () => {
    const item = { app: base, info: null, protected: true };
    expect(canApplyTo("disable", item)).toBe(false);
    expect(canApplyTo("uninstall", item)).toBe(false);
    expect(canApplyTo("enable", { ...item, app: disabled })).toBe(true);
    expect(canApplyTo("restore", { ...item, app: removed })).toBe(true);
    expect(canApplyTo("disable", { ...item, protected: false })).toBe(true);
  });

  it("builds a Google search from name and package", () => {
    expect(
      webSearchUrl({ ...base, label: "Digital Wellbeing", package: "com.google.wellbeing" }),
    ).toBe("https://www.google.com/search?q=Digital%20Wellbeing%20com.google.wellbeing%20android");
    expect(webSearchUrl(base)).toBe("https://www.google.com/search?q=a.b%20android");
  });
});

describe("debloat status", () => {
  it("derives a status key", () => {
    const app = { package: "a.b", label: null, system: true, disabled: false, installed: true };
    expect(statusKey(app)).toBe("enabled");
    expect(statusKey({ ...app, disabled: true })).toBe("disabled");
    expect(statusKey({ ...app, installed: false })).toBe("uninstalled");
  });
});
