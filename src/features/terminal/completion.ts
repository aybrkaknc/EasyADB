export const COMMON_COMMANDS = [
  "devices -l",
  "shell",
  "shell getprop ro.product.model",
  "shell pm list packages",
  "shell pm list packages -3",
  "shell dumpsys battery",
  "shell wm size",
  "shell settings get global",
  "install -r",
  "uninstall",
  "pull",
  "push",
  "reboot",
  "reboot recovery",
  "reboot bootloader",
  "reboot sideload",
  "logcat -d",
  "get-state",
  "kill-server",
  "start-server",
  "version",
  "fastboot devices",
  "fastboot reboot",
  "fastboot getvar all",
];

/**
 * Completes the last word of `line`. Package names are offered after commands
 * that take one; otherwise whole common command lines are suggested.
 * Returns the longest common completion, or null when nothing matches.
 */
export function complete(line: string, packages: string[]): string | null {
  const lastSpace = line.lastIndexOf(" ");
  const head = line.slice(0, lastSpace + 1);
  const word = line.slice(lastSpace + 1);
  const wantsPackage =
    /\b(uninstall|pm (disable-user|enable|clear|path|uninstall)|am force-stop|monkey -p)\s+(\S+\s+)*$/.test(
      head,
    );

  const candidates = wantsPackage
    ? packages.filter((p) => p.startsWith(word)).map((p) => head + p)
    : COMMON_COMMANDS.filter((c) => c.startsWith(line));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0] ?? null;

  let prefix = candidates[0] ?? "";
  for (const candidate of candidates) {
    while (!candidate.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix.length > line.length ? prefix : null;
}
