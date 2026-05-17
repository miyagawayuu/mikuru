import type { MikuruComponent } from "../env";

export type MikuruTextareaProps = {
  label?: string;
  modelValue?: string;
  placeholder?: string;
  rows?: number;
  help?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
};

declare const component: MikuruComponent<MikuruTextareaProps>;
export default component;
export const mount: MikuruComponent<MikuruTextareaProps>["mount"];
