import type { MikuruComponent } from "../env";

export type MikuruProgressProps = {
  value?: number;
  max?: number;
  label?: string;
  indeterminate?: boolean;
};

declare const component: MikuruComponent<MikuruProgressProps>;
export default component;
export const mount: MikuruComponent<MikuruProgressProps>["mount"];
