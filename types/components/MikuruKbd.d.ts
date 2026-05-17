import type { MikuruComponent } from "../env";

export type MikuruKbdProps = {
  label?: string;
};

declare const component: MikuruComponent<MikuruKbdProps>;
export default component;
export const mount: MikuruComponent<MikuruKbdProps>["mount"];
