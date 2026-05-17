import type { MikuruComponent } from "../env";

export type MikuruFileUploadProps = {
  label?: string;
  prompt?: string;
  help?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruFileUploadProps>;
export default component;
export const mount: MikuruComponent<MikuruFileUploadProps>["mount"];
