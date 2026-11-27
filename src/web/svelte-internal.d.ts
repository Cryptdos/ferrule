// The two pieces of Svelte's runtime the edit tests use to hold a project
// as the editor does (`editproxy.test.ts`); Svelte publishes no types for them.
declare module "svelte/internal/client" {
  export function proxy<T>(value: T): T;
  export function snapshot<T>(value: T): T;
}
