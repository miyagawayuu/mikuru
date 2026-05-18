import type { MikuruComponent } from "../env";

export type MikuruFormProps = {
  label?: string;
  title?: string;
  description?: string;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruFormProps>;
export default component;
export const mount: MikuruComponent<MikuruFormProps>["mount"];
