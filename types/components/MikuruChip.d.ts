import type { MikuruComponent } from "../env";

export type MikuruChipProps = {
  label?: string;
  tone?: "neutral" | "info" | "success" | string;
  removable?: boolean;
  removeLabel?: string;
};

declare const component: MikuruComponent<MikuruChipProps>;
export default component;
export const mount: MikuruComponent<MikuruChipProps>["mount"];
