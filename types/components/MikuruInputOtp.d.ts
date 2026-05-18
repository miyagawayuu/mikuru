import type { MikuruComponent } from "../env";

export type MikuruInputOtpProps = {
  label?: string;
  modelValue?: string;
  length?: number;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruInputOtpProps>;
export default component;
export const mount: MikuruComponent<MikuruInputOtpProps>["mount"];
