import type { MikuruComponent } from "../env";

export type MikuruFilterBarFilter = {
  label: string;
  value: string;
};

export type MikuruFilterBarProps = {
  label?: string;
  search?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  filters?: MikuruFilterBarFilter[];
  activeFilter?: string;
};

declare const component: MikuruComponent<MikuruFilterBarProps>;
export default component;
export const mount: MikuruComponent<MikuruFilterBarProps>["mount"];
