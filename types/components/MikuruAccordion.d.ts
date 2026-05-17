import type { MikuruComponent } from "../env";

export type MikuruAccordionItem = string | {
  label?: string;
  value?: string | number;
  panel?: string;
  disabled?: boolean;
};

export type MikuruAccordionProps = {
  items?: MikuruAccordionItem[];
  modelValue?: string | number | Array<string | number>;
  multiple?: boolean;
};

declare const component: MikuruComponent<MikuruAccordionProps>;
export default component;
export const mount: MikuruComponent<MikuruAccordionProps>["mount"];
