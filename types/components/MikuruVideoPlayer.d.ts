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

export type MikuruVideoPlayerControl =
  | "play"
  | "seek"
  | "time"
  | "mute"
  | "volume"
  | "rate"
  | "settings"
  | "fullscreen";

export type MikuruVideoPlayerQualityOption = {
  id?: string | number;
  label: string;
  src: string;
  poster?: string;
};

export type MikuruVideoPlayerProps = {
  src: string;
  poster?: string;
  title?: string;
  subtitle?: string;
  preload?: string;
  width?: string | number;
  height?: string | number;
  aspectRatio?: string | number;
  qualityOptions?: MikuruVideoPlayerQualityOption[];
  controls?: MikuruVideoPlayerControl[];
  live?: boolean;
} & MikuruVideoPlayerEvents;

declare const component: MikuruComponent<MikuruVideoPlayerProps>;
export default component;
export const mount: MikuruComponent<MikuruVideoPlayerProps>["mount"];
