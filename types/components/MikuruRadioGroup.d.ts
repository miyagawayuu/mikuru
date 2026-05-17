import type { MikuruComponent } from "../env";

export type MikuruRadioOption = {
  label: string;
  value: string | number | boolean;
  description?: string;
  disabled?: boolean;
};

export type MikuruRadioGroupProps = {
  label?: string;
  modelValue?: string | number | boolean;
  options?: MikuruRadioOption[];
  name?: string;
  help?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruRadioGroupProps>;
export default component;
export const mount: MikuruComponent<MikuruRadioGroupProps>["mount"];
