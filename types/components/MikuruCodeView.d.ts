import type { MikuruComponent } from "../env";

export type MikuruCodeViewProps = {
  code?: string;
  language?: string;
  showLineNumbers?: boolean;
};

declare const component: MikuruComponent<MikuruCodeViewProps>;
export default component;
export const mount: MikuruComponent<MikuruCodeViewProps>["mount"];
