// What scripts/prerender.mjs takes from the app: its config as the app has it, bundled by Vite for Node (an SSR build:
// the app's imports leave out the extension and read import.meta.env, which only Vite resolves)
export * as dashboards from '../src/config/dashboards';
export * as kommune from '../src/config/kommune';
export * as regions from '../src/config/regions';
export * as seo from '../src/config/seo';
export * as site from '../src/config/site';
export * as views from '../src/config/views';
export * as format from '../src/lib/format';
