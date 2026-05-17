import type { MikuruComponent } from "../env";

export type MikuruEmptyStateProps = {
  icon?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
};

declare const component: MikuruComponent<MikuruEmptyStateProps>;
export default component;
export const mount: MikuruComponent<MikuruEmptyStateProps>["mount"];
