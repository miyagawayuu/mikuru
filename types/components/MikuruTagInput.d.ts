import type { MikuruComponent } from "../env";

export type MikuruTagInputProps = {
  label?: string;
  modelValue?: string[];
  placeholder?: string;
  help?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruTagInputProps>;
export default component;
export const mount: MikuruComponent<MikuruTagInputProps>["mount"];
