import type { MikuruComponent } from "../env";

export type MikuruDrawerProps = {
  open?: boolean;
  title?: string;
  body?: string;
  side?: "left" | "right" | string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
};

declare const component: MikuruComponent<MikuruDrawerProps>;
export default component;
export const mount: MikuruComponent<MikuruDrawerProps>["mount"];
