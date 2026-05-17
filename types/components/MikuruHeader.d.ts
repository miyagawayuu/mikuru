import type { MikuruComponent } from "../env";

export type MikuruHeaderItem = string | {
  label?: string;
  value?: string | number;
  href?: string;
  disabled?: boolean;
};

export type MikuruHeaderProps = {
  title?: string;
  subtitle?: string;
  logo?: string;
  navLabel?: string;
  items?: MikuruHeaderItem[];
  modelValue?: string | number;
  actionLabel?: string;
};

declare const component: MikuruComponent<MikuruHeaderProps>;
export default component;
export const mount: MikuruComponent<MikuruHeaderProps>["mount"];
