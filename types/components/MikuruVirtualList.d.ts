import type { MikuruComponent } from "../env";

export type MikuruVirtualListItem = {
  id?: string;
  value?: string;
  title?: string;
  label?: string;
  description?: string;
};

export type MikuruVirtualListProps = {
  items?: MikuruVirtualListItem[];
  itemHeight?: number;
  height?: number;
};

declare const component: MikuruComponent<MikuruVirtualListProps>;
export default component;
export const mount: MikuruComponent<MikuruVirtualListProps>["mount"];
