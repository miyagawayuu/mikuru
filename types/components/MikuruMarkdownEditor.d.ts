import type { MikuruComponent } from "../env";

export type MikuruMarkdownEditorProps = {
  label?: string;
  modelValue?: string;
  placeholder?: string;
  rows?: number;
  help?: string;
  preview?: boolean;
  disabled?: boolean;
};

declare const component: MikuruComponent<MikuruMarkdownEditorProps>;
export default component;
export const mount: MikuruComponent<MikuruMarkdownEditorProps>["mount"];
