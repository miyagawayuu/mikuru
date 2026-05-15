import type { MikuruComponent } from "../env";

export type MikuruAudioPlayerProps = {
  src: string;
  title?: string;
  artist?: string;
  preload?: string;
};

declare const component: MikuruComponent<MikuruAudioPlayerProps>;
export default component;
export const mount: MikuruComponent<MikuruAudioPlayerProps>["mount"];
