import type { MikuruComponent } from "../env";

export type MikuruImageViewerProps = {
  src: string;
  alt?: string;
  caption?: string;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
};

declare const component: MikuruComponent<MikuruImageViewerProps>;
export default component;
export const mount: MikuruComponent<MikuruImageViewerProps>["mount"];
