import type { MikuruComponent } from "../env";

export type MikuruCarouselImage = string | {
  src: string;
  alt?: string;
  title?: string;
  caption?: string;
};

export type MikuruCarouselProps = {
  images?: MikuruCarouselImage[];
  title?: string;
  autoplay?: boolean;
  interval?: number;
  emptyTitle?: string;
  emptyMessage?: string;
};

declare const component: MikuruComponent<MikuruCarouselProps>;
export default component;
export const mount: MikuruComponent<MikuruCarouselProps>["mount"];
