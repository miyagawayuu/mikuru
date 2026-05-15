import type { MikuruComponent } from "../env";

export type MikuruCodeBlockProps = {
  code?: string;
  language?: string;
  showLineNumbers?: boolean;
};

declare const component: MikuruComponent<MikuruCodeBlockProps>;
export default component;
export const mount: MikuruComponent<MikuruCodeBlockProps>["mount"];
