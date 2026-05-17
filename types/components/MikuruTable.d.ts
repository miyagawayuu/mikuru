import type { MikuruComponent } from "../env";

export type MikuruTableColumn = string | {
  key?: string;
  value?: string;
  label?: string;
  sortable?: boolean;
  align?: "left" | "center" | "right" | string;
  width?: string;
};

export type MikuruTableRow = Record<string, unknown>;

export type MikuruTableProps = {
  columns?: MikuruTableColumn[];
  rows?: MikuruTableRow[];
  caption?: string;
  emptyText?: string;
  loading?: boolean;
  rowKey?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc" | string;
};

declare const component: MikuruComponent<MikuruTableProps>;
export default component;
export const mount: MikuruComponent<MikuruTableProps>["mount"];
