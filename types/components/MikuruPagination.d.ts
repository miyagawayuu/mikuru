import type { MikuruComponent } from "../env";

export type MikuruPaginationProps = {
  page?: number;
  total?: number;
  siblingCount?: number;
  label?: string;
};

declare const component: MikuruComponent<MikuruPaginationProps>;
export default component;
export const mount: MikuruComponent<MikuruPaginationProps>["mount"];
