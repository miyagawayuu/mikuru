import type { MikuruComponent } from "../env";

export type MikuruSearchInputProps = {
  label?: string;
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruSearchInputProps>;
export default component;
export const mount: MikuruComponent<MikuruSearchInputProps>["mount"];
