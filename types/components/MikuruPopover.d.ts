import type { MikuruComponent } from "../env";

export type MikuruPopoverProps = {
  label?: string;
  title?: string;
  body?: string;
  side?: "top" | "right" | "bottom" | "left" | string;
  closeOnOutside?: boolean;
};

declare const component: MikuruComponent<MikuruPopoverProps>;
export default component;
export const mount: MikuruComponent<MikuruPopoverProps>["mount"];
