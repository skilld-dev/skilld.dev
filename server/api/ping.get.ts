// Minimal liveness probe. Touches no bindings so it isolates worker boot cost
// (module eval + isolate spin-up) for scripts/tools/measure-nitro-cold-start.mjs.
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return { ok: true }
})
