type EnvMikuruComponentInstance = {
  element: Element | Comment;
  unmount(): void;
};

type EnvMikuruMount<Props = Record<string, unknown>> = (
  target: Element | DocumentFragment,
  props?: Props
) => EnvMikuruComponentInstance;

type EnvMikuruComponent<Props = Record<string, unknown>> = {
  mount: EnvMikuruMount<Props>;
};

declare module "mikuru/env" {
  export type MikuruComponentInstance = EnvMikuruComponentInstance;
  export type MikuruMount<Props = Record<string, unknown>> = EnvMikuruMount<Props>;
  export type MikuruComponent<Props = Record<string, unknown>> = EnvMikuruComponent<Props>;
}

declare module "*.mikuru" {
  export function mount(
    target: Element | DocumentFragment,
    props?: Record<string, unknown>
  ): EnvMikuruComponentInstance;

  const component: EnvMikuruComponent;
  export default component;
}
