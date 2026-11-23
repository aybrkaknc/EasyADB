import type { LogLine } from "../../bindings";

export const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;
export type Level = (typeof LEVELS)[number];

export interface LogFilter {
  levels: Set<string>;
  /** Comma separated tag substrings; empty means all tags. */
  tags: string;
  /** Regular expression source; empty means no search. */
  search: string;
}

/** Compiles the search box into a case-insensitive regex, or reports it as invalid. */
export function compileSearch(source: string): RegExp | null | "invalid" {
  if (!source.trim()) return null;
  try {
    return new RegExp(source, "i");
  } catch {
    return "invalid";
  }
}

export function filterLines(lines: LogLine[], filter: LogFilter): LogLine[] {
  const tags = filter.tags
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const search = compileSearch(filter.search);
  const regex = search instanceof RegExp ? search : null;
  return lines.filter(
    (line) =>
      filter.levels.has(line.level) &&
      (tags.length === 0 || tags.some((t) => line.tag.toLowerCase().includes(t))) &&
      (!regex || regex.test(line.message) || regex.test(line.tag)),
  );
}

/** Splits `text` into plain and matched parts for highlighting. */
export function highlight(text: string, regex: RegExp | null): { text: string; match: boolean }[] {
  if (!regex) return [{ text, match: false }];
  const global = new RegExp(regex.source, "gi");
  const parts: { text: string; match: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(global)) {
    if (m[0] === "") break;
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: m[0], match: true });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

export function formatLine(line: LogLine): string {
  return `${line.time} ${line.pid} ${line.tid} ${line.level} ${line.tag}: ${line.message}`;
}
