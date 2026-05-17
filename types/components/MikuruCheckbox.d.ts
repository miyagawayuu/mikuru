import type { MikuruComponent } from "../env";

export type MikuruCheckboxProps = {
  label?: string;
  description?: string;
  modelValue?: boolean | string | number | Array<string | number | boolean>;
  value?: string | number | boolean;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruCheckboxProps>;
export default component;
export const mount: MikuruComponent<MikuruCheckboxProps>["mount"];
