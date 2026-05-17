import type { MikuruComponent } from "../env";

export type MikuruDataListItem = {
  id?: string;
  title: string;
  description?: string;
  meta?: string;
};

export type MikuruDataListProps = {
  label?: string;
  items?: MikuruDataListItem[];
};

declare const component: MikuruComponent<MikuruDataListProps>;
export default component;
export const mount: MikuruComponent<MikuruDataListProps>["mount"];
