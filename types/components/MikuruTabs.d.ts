import type { MikuruComponent } from "../env";

export type MikuruTabsItem = string | {
  label?: string;
  value?: string | number;
  panel?: string;
  disabled?: boolean;
};

export type MikuruTabsProps = {
  label?: string;
  items?: MikuruTabsItem[];
  modelValue?: string | number;
};

declare const component: MikuruComponent<MikuruTabsProps>;
export default component;
export const mount: MikuruComponent<MikuruTabsProps>["mount"];
