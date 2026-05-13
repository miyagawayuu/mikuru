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

type EnvMikuruHydrationComponent<Props = Record<string, unknown>> = EnvMikuruComponent<Props> & {
  hydrate(
    target: Element,
    props?: Props
  ): EnvMikuruComponentInstance;
};

declare module "mikuru/env" {
  export type MikuruComponentInstance = EnvMikuruComponentInstance;
  export type MikuruMount<Props = Record<string, unknown>> = EnvMikuruMount<Props>;
  export type MikuruComponent<Props = Record<string, unknown>> = EnvMikuruComponent<Props>;
  export type MikuruHydrationComponent<Props = Record<string, unknown>> = EnvMikuruHydrationComponent<Props>;
}

declare module "*.mikuru" {
  export function mount(
    target: Element | DocumentFragment,
    props?: Record<string, unknown>
  ): EnvMikuruComponentInstance;

  const component: EnvMikuruComponent;
  export default component;
}

declare module "*.mikuru?hydrate" {
  export function mount(
    target: Element | DocumentFragment,
    props?: Record<string, unknown>
  ): EnvMikuruComponentInstance;

  export function hydrate(
    target: Element,
    props?: Record<string, unknown>
  ): EnvMikuruComponentInstance;

  const component: EnvMikuruHydrationComponent;
  export default component;
}

declare module "*.mikuru?ssr" {
  export function renderToString(
    props?: Record<string, unknown>
  ): Promise<string>;
}
