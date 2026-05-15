import type { MikuruComponent } from "../env";

export type MikuruVideoPlayerProps = {
  src: string;
  poster?: string;
  title?: string;
  subtitle?: string;
  preload?: string;
};

declare const component: MikuruComponent<MikuruVideoPlayerProps>;
export default component;
export const mount: MikuruComponent<MikuruVideoPlayerProps>["mount"];
