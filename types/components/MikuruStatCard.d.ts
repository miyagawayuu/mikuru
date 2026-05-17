import type { MikuruComponent } from "../env";

export type MikuruStatCardProps = {
  label?: string;
  value?: string;
  detail?: string;
  tone?: "neutral" | "success" | "info" | "warning" | string;
};

declare const component: MikuruComponent<MikuruStatCardProps>;
export default component;
export const mount: MikuruComponent<MikuruStatCardProps>["mount"];
