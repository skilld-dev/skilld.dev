// Wrangler serves .output/public through the ASSETS binding before dispatching
// to the Worker. Keep Nitro's per-file asset table out of the eager entrypoint.
export default {}
