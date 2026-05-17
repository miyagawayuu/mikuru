import type { MikuruComponent } from "../env";

export type MikuruAlertDialogProps = {
  open?: boolean;
  title?: string;
  description?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
};

declare const component: MikuruComponent<MikuruAlertDialogProps>;
export default component;
export const mount: MikuruComponent<MikuruAlertDialogProps>["mount"];
