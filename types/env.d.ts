type EnvMikuruComponentInstance = {
  element: Element | Comment;
  unmount(): void;
};

type EnvMikuruMount = (
  target: Element | DocumentFragment,
  props?: Record<string, unknown>
) => EnvMikuruComponentInstance;

type EnvMikuruComponent = {
  mount: EnvMikuruMount;
};

declare module "mikuru/env" {
  export type MikuruComponentInstance = EnvMikuruComponentInstance;
  export type MikuruMount = EnvMikuruMount;
  export type MikuruComponent = EnvMikuruComponent;
}

declare module "*.mikuru" {
  export function mount(
    target: Element | DocumentFragment,
    props?: Record<string, unknown>
  ): EnvMikuruComponentInstance;

  const component: EnvMikuruComponent;
  export default component;
}
