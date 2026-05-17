import type { MikuruComponent } from "../env";

export type MikuruBadgeProps = {
  label?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | string;
  variant?: "soft" | "outline" | string;
};

declare const component: MikuruComponent<MikuruBadgeProps>;
export default component;
export const mount: MikuruComponent<MikuruBadgeProps>["mount"];
