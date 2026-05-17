import type { MikuruComponent } from "../env";

export type MikuruFooterLink = string | {
  label?: string;
  value?: string | number;
  href?: string;
};

export type MikuruFooterProps = {
  title?: string;
  description?: string;
  note?: string;
  navLabel?: string;
  links?: MikuruFooterLink[];
};

declare const component: MikuruComponent<MikuruFooterProps>;
export default component;
export const mount: MikuruComponent<MikuruFooterProps>["mount"];
