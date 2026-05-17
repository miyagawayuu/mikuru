import type { MikuruComponent } from "../env";

export type MikuruRangeSliderProps = {
  label?: string;
  minValue?: number;
  maxValue?: number;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
};

declare const component: MikuruComponent<MikuruRangeSliderProps>;
export default component;
export const mount: MikuruComponent<MikuruRangeSliderProps>["mount"];
