import type { MikuruComponent } from "../env";

export type MikuruWysiwygEditorProps = {
  label?: string;
  modelValue?: string;
  placeholder?: string;
  help?: string;
};

declare const component: MikuruComponent<MikuruWysiwygEditorProps>;
export default component;
export const mount: MikuruComponent<MikuruWysiwygEditorProps>["mount"];
