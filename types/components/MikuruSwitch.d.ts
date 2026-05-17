import type { MikuruComponent } from "../env";

export type MikuruSwitchProps = {
  label?: string;
  modelValue?: boolean;
  help?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruSwitchProps>;
export default component;
export const mount: MikuruComponent<MikuruSwitchProps>["mount"];
