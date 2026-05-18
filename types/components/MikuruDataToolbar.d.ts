import type { MikuruComponent } from "../env";

export type MikuruDataToolbarAction = {
  id?: string;
  label: string;
  disabled?: boolean;
};

export type MikuruDataToolbarProps = {
  title?: string;
  description?: string;
  actions?: MikuruDataToolbarAction[];
};

declare const component: MikuruComponent<MikuruDataToolbarProps>;
export default component;
export const mount: MikuruComponent<MikuruDataToolbarProps>["mount"];
