import type { MikuruComponent } from "../env";

export type MikuruAudioPlayerEventPayload = {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  nativeEvent?: Event;
};

export type MikuruAudioPlayerEvents = {
  onLoadedmetadata?: (payload: MikuruAudioPlayerEventPayload) => void;
  onTimeupdate?: (payload: MikuruAudioPlayerEventPayload) => void;
  onDurationchange?: (payload: MikuruAudioPlayerEventPayload) => void;
  onPlay?: (payload: MikuruAudioPlayerEventPayload) => void;
  onPause?: (payload: MikuruAudioPlayerEventPayload) => void;
  onEnded?: (payload: MikuruAudioPlayerEventPayload) => void;
  onSeeked?: (payload: MikuruAudioPlayerEventPayload) => void;
  onVolumechange?: (payload: MikuruAudioPlayerEventPayload) => void;
  onRatechange?: (payload: MikuruAudioPlayerEventPayload) => void;
};

export type MikuruAudioPlayerProps = {
  src: string;
  title?: string;
  artist?: string;
  preload?: string;
} & MikuruAudioPlayerEvents;

declare const component: MikuruComponent<MikuruAudioPlayerProps>;
export default component;
export const mount: MikuruComponent<MikuruAudioPlayerProps>["mount"];
