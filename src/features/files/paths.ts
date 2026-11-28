export function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}`;
}

/** The last part of a phone or PC path. */
export const localName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** The folder above a Windows folder, or null for a drive. */
export function localParent(path: string): string | null {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length < 2) return null;
  parts.pop();
  // A drive keeps its backslash: `C:` alone means the current folder of that drive.
  return parts.length === 1 ? `${parts[0]}\\` : parts.join("\\");
}
