import type { MikuruComponent } from "../env";

export type MikuruBreadcrumbItem = {
  label: string;
  value?: string;
  href?: string;
  current?: boolean;
};

export type MikuruBreadcrumbProps = {
  items?: MikuruBreadcrumbItem[];
};

declare const component: MikuruComponent<MikuruBreadcrumbProps>;
export default component;
export const mount: MikuruComponent<MikuruBreadcrumbProps>["mount"];
