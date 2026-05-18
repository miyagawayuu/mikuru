import type { MikuruComponent } from "../env";

export type MikuruFieldProps = {
  label?: string;
  help?: string;
  error?: string;
  required?: boolean;
};

declare const component: MikuruComponent<MikuruFieldProps>;
export default component;
export const mount: MikuruComponent<MikuruFieldProps>["mount"];
