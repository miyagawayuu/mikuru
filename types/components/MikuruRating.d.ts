import type { MikuruComponent } from "../env";

export type MikuruRatingProps = {
  label?: string;
  modelValue?: number;
  max?: number;
  symbol?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruRatingProps>;
export default component;
export const mount: MikuruComponent<MikuruRatingProps>["mount"];
