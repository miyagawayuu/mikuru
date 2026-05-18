import type { MikuruComponent } from "../env";

export type MikuruComboboxMultiOption = {
  label: string;
  value: string;
};

export type MikuruComboboxMultiProps = {
  label?: string;
  modelValue?: string[];
  options?: MikuruComboboxMultiOption[];
  placeholder?: string;
};

declare const component: MikuruComponent<MikuruComboboxMultiProps>;
export default component;
export const mount: MikuruComponent<MikuruComboboxMultiProps>["mount"];
