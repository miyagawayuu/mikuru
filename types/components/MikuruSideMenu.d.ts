import type { MikuruComponent } from "../env";

export type MikuruSideMenuItem = string | {
  label?: string;
  value?: string | number;
  icon?: string;
  badge?: string | number;
  disabled?: boolean;
};

export type MikuruSideMenuProps = {
  title?: string;
  label?: string;
  items?: MikuruSideMenuItem[];
  modelValue?: string | number;
  collapsed?: boolean;
  collapsible?: boolean;
};

declare const component: MikuruComponent<MikuruSideMenuProps>;
export default component;
export const mount: MikuruComponent<MikuruSideMenuProps>["mount"];
