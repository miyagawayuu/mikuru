import type { MikuruComponent } from "../env";

export type MikuruAvatarProps = {
  src?: string;
  name?: string;
  alt?: string;
  size?: "sm" | "md" | "lg" | string;
};

declare const component: MikuruComponent<MikuruAvatarProps>;
export default component;
export const mount: MikuruComponent<MikuruAvatarProps>["mount"];
