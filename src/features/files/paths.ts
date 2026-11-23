export function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return `/${parts.join("/")}`;
}
