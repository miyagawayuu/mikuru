import type { MikuruComponent } from "../env";

export type MikuruPasswordInputProps = {
  label?: string;
  modelValue?: string;
  placeholder?: string;
  autocomplete?: string;
  disabled?: boolean;
  strength?: boolean;
  showLabel?: string;
  hideLabel?: string;
};

declare const component: MikuruComponent<MikuruPasswordInputProps>;
export default component;
export const mount: MikuruComponent<MikuruPasswordInputProps>["mount"];
