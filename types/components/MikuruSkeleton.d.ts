import type { MikuruComponent } from "../env";

export type MikuruSkeletonProps = {
  lines?: number;
  width?: string;
  height?: string;
  shape?: "text" | "card" | "circle" | string;
  animated?: boolean;
};

declare const component: MikuruComponent<MikuruSkeletonProps>;
export default component;
export const mount: MikuruComponent<MikuruSkeletonProps>["mount"];
