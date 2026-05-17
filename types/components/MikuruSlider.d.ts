import type { MikuruComponent } from "../env";

export type MikuruSliderProps = {
  label?: string;
  modelValue?: number;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruSliderProps>;
export default component;
export const mount: MikuruComponent<MikuruSliderProps>["mount"];
