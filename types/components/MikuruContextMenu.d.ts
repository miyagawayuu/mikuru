import type { MikuruComponent } from "../env";

export type MikuruContextMenuItem = {
  id?: string;
  value?: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
};

export type MikuruContextMenuProps = {
  label?: string;
  items?: MikuruContextMenuItem[];
};

declare const component: MikuruComponent<MikuruContextMenuProps>;
export default component;
export const mount: MikuruComponent<MikuruContextMenuProps>["mount"];
