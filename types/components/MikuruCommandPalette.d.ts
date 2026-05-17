import type { MikuruComponent } from "../env";

export type MikuruCommandPaletteCommand = {
  id?: string;
  label: string;
  description?: string;
  keywords?: string;
};

export type MikuruCommandPaletteProps = {
  open?: boolean;
  commands?: MikuruCommandPaletteCommand[];
  placeholder?: string;
  emptyText?: string;
  shortcut?: boolean;
};

declare const component: MikuruComponent<MikuruCommandPaletteProps>;
export default component;
export const mount: MikuruComponent<MikuruCommandPaletteProps>["mount"];
