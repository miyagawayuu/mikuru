import type { MikuruComponent } from "../env";

export type MikuruCalendarProps = {
  label?: string;
  modelValue?: string;
  locale?: string;
};

declare const component: MikuruComponent<MikuruCalendarProps>;
export default component;
export const mount: MikuruComponent<MikuruCalendarProps>["mount"];
