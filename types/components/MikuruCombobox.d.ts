import type { MikuruComponent } from "../env";

export type MikuruComboboxOption = string | {
  label?: string;
  value?: string | number;
  description?: string;
  disabled?: boolean;
};

export type MikuruComboboxProps = {
  label?: string;
  modelValue?: string | number;
  options?: MikuruComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruComboboxProps>;
export default component;
export const mount: MikuruComponent<MikuruComboboxProps>["mount"];
