import type { MikuruComponent } from "../env";

export type MikuruToolTipProps = {
  text?: string;
  label?: string;
  placement?: "top" | "bottom" | "left" | "right" | string;
};

declare const component: MikuruComponent<MikuruToolTipProps>;
export default component;
export const mount: MikuruComponent<MikuruToolTipProps>["mount"];
