import { describe, expect, it } from "vitest";

import en from "./en.json";
import tr from "./tr.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") acc[path] = value;
    else Object.assign(acc, flatten(value, path));
    return acc;
  }, {});
}

const enKeys = flatten(en as Tree);
const trKeys = flatten(tr as Tree);

describe("translations", () => {
  it("have the same keys in English and Turkish", () => {
    expect(Object.keys(trKeys).sort()).toEqual(Object.keys(enKeys).sort());
  });

  it("have no empty values", () => {
    for (const [key, value] of [...Object.entries(enKeys), ...Object.entries(trKeys)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("use the same interpolation variables", () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(enKeys)) {
      expect(vars(trKeys[key] ?? ""), key).toEqual(vars(enKeys[key] ?? ""));
    }
  });

  it("cover every backend error code", async () => {
    const bindings = await import("../../bindings.ts?raw");
    const match = /export type ErrorCode = ([^;]+);/.exec(bindings.default);
    const codes = [...(match?.[1] ?? "").matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) expect(enKeys[`errors.${code}`], code).toBeDefined();
  });
});
