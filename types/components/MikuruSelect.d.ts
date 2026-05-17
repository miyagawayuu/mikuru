import type { MikuruComponent } from "../env";

export type MikuruSelectOption = string | {
  label?: string;
  value?: string | number;
  disabled?: boolean;
};

export type MikuruSelectProps = {
  label?: string;
  modelValue?: string | number;
  options?: MikuruSelectOption[];
  placeholder?: string;
  help?: string;
  disabled?: boolean;
  required?: boolean;
};

declare const component: MikuruComponent<MikuruSelectProps>;
export default component;
export const mount: MikuruComponent<MikuruSelectProps>["mount"];
