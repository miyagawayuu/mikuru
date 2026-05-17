import type { MikuruComponent } from "../env";

export type MikuruTreeViewNode = {
  id?: string;
  value?: string;
  label: string;
  children?: MikuruTreeViewNode[];
};

export type MikuruTreeViewProps = {
  label?: string;
  nodes?: MikuruTreeViewNode[];
};

declare const component: MikuruComponent<MikuruTreeViewProps>;
export default component;
export const mount: MikuruComponent<MikuruTreeViewProps>["mount"];
