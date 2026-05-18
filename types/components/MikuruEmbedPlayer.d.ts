import type { MikuruComponent } from "../env";

export type MikuruEmbedPlayerProvider =
  | "auto"
  | "youtube"
  | "vimeo"
  | "dailymotion"
  | "twitch"
  | "niconico"
  | "tiktok"
  | "bilibili"
  | "wistia"
  | "generic";

export type MikuruEmbedPlayerLoadPayload = {
  provider: string;
  videoId: string;
  src: string;
  nativeEvent?: Event;
};

export type MikuruEmbedPlayerUnsupportedPayload = {
  url: string;
  provider: string;
  videoId: string;
};

export type MikuruEmbedPlayerEvents = {
  onLoad?: (payload: MikuruEmbedPlayerLoadPayload) => void;
  onUnsupported?: (payload: MikuruEmbedPlayerUnsupportedPayload) => void;
};

export type MikuruEmbedPlayerProps = {
  url?: string;
  provider?: MikuruEmbedPlayerProvider | string;
  videoId?: string;
  title?: string;
  caption?: string;
  width?: string | number;
  height?: string | number;
  aspectRatio?: string | number;
  autoplay?: boolean;
  muted?: boolean;
  controls?: boolean;
  loop?: boolean;
  privacy?: boolean;
  start?: number;
  end?: number;
  playlist?: string;
  parent?: string;
  loading?: "eager" | "lazy" | string;
  allow?: string;
  referrerPolicy?: string;
  sandbox?: string;
  emptyTitle?: string;
  emptyMessage?: string;
} & MikuruEmbedPlayerEvents;

declare const component: MikuruComponent<MikuruEmbedPlayerProps>;
export default component;
export const mount: MikuruComponent<MikuruEmbedPlayerProps>["mount"];
