import type { MikuruComponent } from "../env";

export type MikuruDatePickerProps = {
  label?: string;
  modelValue?: string;
  placeholder?: string;
  locale?: string;
};

declare const component: MikuruComponent<MikuruDatePickerProps>;
export default component;
export const mount: MikuruComponent<MikuruDatePickerProps>["mount"];
