import type { MikuruComponent } from "../env";

export type MikuruSegmentedControlOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type MikuruSegmentedControlProps = {
  label?: string;
  modelValue?: string;
  options?: MikuruSegmentedControlOption[];
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruSegmentedControlProps>;
export default component;
export const mount: MikuruComponent<MikuruSegmentedControlProps>["mount"];
