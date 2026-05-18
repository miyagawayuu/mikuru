import type { MikuruComponent } from "../env";

export type MikuruFormMessageProps = {
  message?: string;
  tone?: "neutral" | "error" | "success" | "warning" | string;
};

declare const component: MikuruComponent<MikuruFormMessageProps>;
export default component;
export const mount: MikuruComponent<MikuruFormMessageProps>["mount"];
