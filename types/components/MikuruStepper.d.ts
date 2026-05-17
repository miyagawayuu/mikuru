import type { MikuruComponent } from "../env";

export type MikuruStepperStep = {
  label: string;
  value: string;
  description?: string;
  completed?: boolean;
  index?: string | number;
};

export type MikuruStepperProps = {
  steps?: MikuruStepperStep[];
  current?: string;
  orientation?: "horizontal" | "vertical" | string;
};

declare const component: MikuruComponent<MikuruStepperProps>;
export default component;
export const mount: MikuruComponent<MikuruStepperProps>["mount"];
