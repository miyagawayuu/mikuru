import type { MikuruComponent } from "../env";

export type MikuruAvatarGroupItem = {
  id?: string;
  src?: string;
  name: string;
  alt?: string;
};

export type MikuruAvatarGroupProps = {
  avatars?: MikuruAvatarGroupItem[];
  max?: number;
  size?: "sm" | "md" | "lg" | string;
  label?: string;
};

declare const component: MikuruComponent<MikuruAvatarGroupProps>;
export default component;
export const mount: MikuruComponent<MikuruAvatarGroupProps>["mount"];
