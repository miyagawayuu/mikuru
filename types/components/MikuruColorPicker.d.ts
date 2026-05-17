import type { MikuruComponent } from "../env";

export type MikuruColorPickerProps = {
  label?: string;
  modelValue?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruColorPickerProps>;
export default component;
export const mount: MikuruComponent<MikuruColorPickerProps>["mount"];
