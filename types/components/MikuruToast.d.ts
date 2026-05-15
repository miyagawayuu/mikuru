import type { MikuruComponent } from "../env";

export type MikuruToastItem = {
  id?: string | number;
  title?: string;
  message?: string;
  tone?: "info" | "success" | "warning" | "danger" | string;
};

export type MikuruToastProps = {
  toasts?: MikuruToastItem[];
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | string;
};

declare const component: MikuruComponent<MikuruToastProps>;
export default component;
export const mount: MikuruComponent<MikuruToastProps>["mount"];
