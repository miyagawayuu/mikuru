import type { MikuruComponent } from "../env";

export type MikuruTimePickerProps = {
  label?: string;
  modelValue?: string;
  step?: number;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruTimePickerProps>;
export default component;
export const mount: MikuruComponent<MikuruTimePickerProps>["mount"];
