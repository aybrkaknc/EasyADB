/** Changes the user makes themselves need no message. */
const until = new Map<string, number>();
const QUIET_MS = 10_000;

/** Silences messages about one phone for a moment, or about every phone with `"*"`. */
export function quiet(key: string) {
  until.set(key, Date.now() + QUIET_MS);
}

export function isQuiet(key: string) {
  const now = Date.now();
  return (until.get(key) ?? 0) > now || (until.get("*") ?? 0) > now;
}
