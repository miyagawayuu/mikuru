import type { MikuruComponent } from "../env";

export type MikuruVideoPlayerEventPayload = {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  nativeEvent?: Event;
};

export type MikuruVideoPlayerEvents = {
  onLoadedmetadata?: (payload: MikuruVideoPlayerEventPayload) => void;
  onTimeupdate?: (payload: MikuruVideoPlayerEventPayload) => void;
  onDurationchange?: (payload: MikuruVideoPlayerEventPayload) => void;
  onPlay?: (payload: MikuruVideoPlayerEventPayload) => void;
  onPause?: (payload: MikuruVideoPlayerEventPayload) => void;
  onEnded?: (payload: MikuruVideoPlayerEventPayload) => void;
  onSeeked?: (payload: MikuruVideoPlayerEventPayload) => void;
  onVolumechange?: (payload: MikuruVideoPlayerEventPayload) => void;
  onRatechange?: (payload: MikuruVideoPlayerEventPayload) => void;
};

export type MikuruVideoPlayerProps = {
  src: string;
  poster?: string;
  title?: string;
  subtitle?: string;
  preload?: string;
} & MikuruVideoPlayerEvents;

declare const component: MikuruComponent<MikuruVideoPlayerProps>;
export default component;
export const mount: MikuruComponent<MikuruVideoPlayerProps>["mount"];
