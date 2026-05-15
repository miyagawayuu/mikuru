import type { MikuruComponent } from "../env";

export type MikuruModalProps = {
  open?: boolean;
  title?: string;
  body?: string;
  footer?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
};

declare const component: MikuruComponent<MikuruModalProps>;
export default component;
export const mount: MikuruComponent<MikuruModalProps>["mount"];
