/**
 * Returns a localStorage key namespaced by environment so that
 * dev builds and production builds never share the same storage.
 *
 * Dev:  "ultrastardj-settings:dev"
 * Prod: "ultrastardj-settings"
 */
export function storageKey(key: string): string {
  return import.meta.env.DEV ? `${key}:dev` : key
}
