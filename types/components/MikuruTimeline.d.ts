import type { MikuruComponent } from "../env";

export type MikuruTimelineItem = {
  id?: string;
  title: string;
  description?: string;
  time?: string;
  tone?: "neutral" | "success" | "info" | "warning" | string;
};

export type MikuruTimelineProps = {
  items?: MikuruTimelineItem[];
};

declare const component: MikuruComponent<MikuruTimelineProps>;
export default component;
export const mount: MikuruComponent<MikuruTimelineProps>["mount"];
