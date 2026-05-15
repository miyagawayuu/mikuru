import type { MikuruComponent } from "../env";

export type MikuruDropdownItem = string | {
  label?: string;
  value?: string | number;
  description?: string;
  disabled?: boolean;
};

export type MikuruDropdownProps = {
  label?: string;
  items?: MikuruDropdownItem[];
};

declare const component: MikuruComponent<MikuruDropdownProps>;
export default component;
export const mount: MikuruComponent<MikuruDropdownProps>["mount"];
