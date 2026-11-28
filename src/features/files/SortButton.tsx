import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "../../shared/lib/cn";
import type { Sort, SortKey } from "./sort";

export function SortButton({
  label,
  column,
  sort,
  onSort,
  right,
}: {
  label: string;
  column: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "flex w-full items-center gap-1 whitespace-nowrap uppercase",
        right && "justify-end",
      )}
    >
      {label}
      {active &&
        (sort.dir === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        ))}
    </button>
  );
}
