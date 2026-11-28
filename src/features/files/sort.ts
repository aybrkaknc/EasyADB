export type SortKey = "name" | "size" | "modified";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export interface Sortable {
  name: string;
  isDir: boolean;
  size: number | null;
  modified: number | null;
}

const byName = (a: Sortable, b: Sortable) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Folders first, then the chosen column. Missing values go last. */
export function sortFiles<T extends Sortable>(files: T[], sort: Sort): T[] {
  const compare = (a: T, b: T) => {
    if (sort.key === "name") return byName(a, b);
    const x = sort.key === "size" ? a.size : a.modified;
    const y = sort.key === "size" ? b.size : b.modified;
    if (x === y) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  };
  return [...files].sort(
    (a, b) =>
      Number(b.isDir) - Number(a.isDir) || (sort.dir === "asc" ? compare(a, b) : -compare(a, b)),
  );
}

/** The sort after a click on a column heading. */
export const nextSort = (sort: Sort, key: SortKey): Sort => ({
  key,
  dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc",
});

/** Whether a name is among those that the search box asks for. */
export const matches = (name: string, search: string) =>
  name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
