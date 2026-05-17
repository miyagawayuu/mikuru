import type { MikuruComponent } from "../env";

export type MikuruTextInputProps = {
  label?: string;
  modelValue?: string | number;
  placeholder?: string;
  type?: string;
  help?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
};

declare const component: MikuruComponent<MikuruTextInputProps>;
export default component;
export const mount: MikuruComponent<MikuruTextInputProps>["mount"];
