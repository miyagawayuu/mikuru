declare module "*.mikuru" {
  export type MikuruComponentInstance = {
    element: Element | Comment;
    unmount(): void;
  };

  export function mount(
    target: Element | DocumentFragment,
    props?: Record<string, unknown>
  ): MikuruComponentInstance;

  const component: {
    mount: typeof mount;
  };

  export default component;
}
