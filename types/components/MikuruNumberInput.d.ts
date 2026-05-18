import type { MikuruComponent } from "../env";

export type MikuruNumberInputProps = {
  label?: string;
  modelValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruNumberInputProps>;
export default component;
export const mount: MikuruComponent<MikuruNumberInputProps>["mount"];
