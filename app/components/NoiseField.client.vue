<script setup lang="ts">
import { useDocumentVisibility, useElementSize, useMouseInElement, useRafFn } from '@vueuse/core'
import { isSoftwareRenderer, isUsableWebGL2Context, webglRendererName } from '../utils/webgl-context'

const props = withDefaults(defineProps<{
  opacity?: number
}>(), {
  opacity: 0.45,
})

const colorMode = useColorMode()
const { prefersReducedMotion } = useMotionA11y()
const isDark = computed(() => colorMode.value === 'dark')

function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++)
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

// Seed hue from device characteristics so each visitor gets a unique color
const hue = computed(() => {
  const seed = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    `${screen.colorDepth}`,
  ].join('|')
  return (djb2(seed) % 360) / 360
})

const containerRef = ref<HTMLElement>()
const canvasRef = ref<HTMLCanvasElement>()
const { width, height } = useElementSize(containerRef)
const { elementX, elementY, isOutside } = useMouseInElement(containerRef)
const visibility = useDocumentVisibility()

const VERT = `#version 300 es
void main() {
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_hue;
uniform float u_opacity;
uniform float u_dpr;
uniform float u_dark;

out vec4 fragColor;

const float DOT_RADIUS = 1.5;
const float GRID_SPACING = 10.0;
const float GLOW_SIGMA = 4.0;

// Pseudo-random from 3D input for per-cell per-frame variation
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// HSL to RGB
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  float hh = h * 6.0;
  if (hh < 1.0) rgb = vec3(c, x, 0.0);
  else if (hh < 2.0) rgb = vec3(x, c, 0.0);
  else if (hh < 3.0) rgb = vec3(0.0, c, x);
  else if (hh < 4.0) rgb = vec3(0.0, x, c);
  else if (hh < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

float rippleBrightness(vec2 gridPos, vec2 center, float t) {
  float d = distance(gridPos, center);
  float val = 0.0;

  // 3 expanding ring wavefronts
  for (int ring = 0; ring < 3; ring++) {
    float rt = t - float(ring) * 0.5;
    if (rt <= 0.0) continue;
    float front = rt * 4.0;
    float proximity = abs(d - front);
    val += exp(-proximity * proximity * 0.8) * exp(-rt * 0.4);
  }

  // Ambient shimmer: fades in after ripples, stays permanently
  float shimmerOnset = clamp((t - 1.0) * 0.5, 0.0, 1.0);
  float t4 = t * 4.0;
  float j1 = hash3(vec3(gridPos, floor(t4)));
  float j2 = hash3(vec3(gridPos, floor(t4) + 1.0));
  float jitter = mix(j1, j2, smoothstep(0.0, 1.0, fract(t4)));

  // Shimmer range: 0.2 to 0.8 so dots are clearly visible
  float shimmer = shimmerOnset * (jitter * 0.6 + 0.2);

  return clamp(val + shimmer, 0.0, 1.0);
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  float spacing = GRID_SPACING * u_dpr;
  float radius = DOT_RADIUS * u_dpr;
  float glowSigma = GLOW_SIGMA * u_dpr;

  // Nearest grid dot center
  vec2 gridPixel = round(pixel / spacing) * spacing;
  vec2 gridCoord = gridPixel / spacing;
  float distToDot = distance(pixel, gridPixel);

  // Ripple center in grid units
  vec2 center = (u_resolution * 0.5) / spacing;

  float b = rippleBrightness(gridCoord, center, u_time);

  // Mouse proximity: radial glow around cursor
  if (u_mouse.x >= 0.0) {
    vec2 mouseGrid = u_mouse / spacing;
    float md = distance(gridCoord, mouseGrid);
    b = max(b, exp(-md * md * 0.006) * 1.0);
  }

  // Skip invisible cells
  if (b < 0.05) {
    fragColor = vec4(0.0);
    return;
  }

  // Dot core
  float dot = smoothstep(radius + 0.5, radius - 0.5, distToDot);

  // Soft glow halo around each dot
  float glow = exp(-distToDot * distToDot / (2.0 * glowSigma * glowSigma));

  // Final intensity: dot is bright center, glow is halo
  float alpha = (dot + glow * 0.5) * b * u_opacity;

  // Color: adapt to dark/light mode
  float s, l;
  if (u_dark > 0.5) {
    // Dark mode: vivid light dots
    s = 0.4 + b * 0.2;
    l = 0.45 + b * 0.25;
  } else {
    // Light mode: muted, slightly darker than bg
    s = 0.15 + b * 0.1;
    l = 0.65 - b * 0.1;
    alpha *= 0.5; // softer in light mode
  }
  vec3 color = hsl2rgb(u_hue, s, l);

  fragColor = vec4(color, alpha);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader)
    return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag)
  if (!vs || !fs)
    return null
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return program
}

let gl: WebGL2RenderingContext | null = null
let program: WebGLProgram | null = null
let vao: WebGLVertexArrayObject | null = null
const uniforms = {
  u_time: null as WebGLUniformLocation | null,
  u_resolution: null as WebGLUniformLocation | null,
  u_mouse: null as WebGLUniformLocation | null,
  u_hue: null as WebGLUniformLocation | null,
  u_opacity: null as WebGLUniformLocation | null,
  u_dpr: null as WebGLUniformLocation | null,
  u_dark: null as WebGLUniformLocation | null,
}
let startTime = 0
let intersectionObserver: IntersectionObserver | null = null

// The rings have faded by now and only the ambient shimmer moves. Its jitter
// steps at 4 Hz, so a capped frame rate keeps it smooth for a fraction of the
// GPU and main thread work. The cursor glow still runs at the display rate.
const INTRO_SECONDS = 8
const AMBIENT_FPS = 15

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: false,
  antialias: false,
  powerPreference: 'low-power',
}

/**
 * A browser without GPU acceleration (no GPU, a blocklisted driver, most
 * headless browsers) runs WebGL on the CPU, and each frame of a full-bleed
 * shader becomes a long task on the main thread. Some browsers refuse that
 * context under `failIfMajorPerformanceCaveat`; Chrome hands out SwiftShader
 * anyway, so the renderer name decides too. Either way the field draws one
 * static frame.
 */
type FieldContext
  = | { _tag: 'accelerated', gl: WebGL2RenderingContext }
    | { _tag: 'software', gl: WebGL2RenderingContext }

function createContext(canvas: HTMLCanvasElement): FieldContext | null {
  const accelerated = canvas.getContext('webgl2', { ...CONTEXT_ATTRIBUTES, failIfMajorPerformanceCaveat: true })
  if (isUsableWebGL2Context(accelerated))
    return { _tag: isSoftwareRenderer(webglRendererName(accelerated)) ? 'software' : 'accelerated', gl: accelerated }
  const software = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES)
  return isUsableWebGL2Context(software) ? { _tag: 'software', gl: software } : null
}

const isStatic = ref(false)
const introDone = ref(false)
// Software rendering pays per pixel on the CPU, so it draws at 1x.
let maxDpr = 2

function canvasDpr(): number {
  return Math.min(window.devicePixelRatio || 1, maxDpr)
}

function initGL(): FieldContext['_tag'] | null {
  const canvas = canvasRef.value
  if (!canvas)
    return null

  const context = createContext(canvas)
  if (!context)
    return null
  gl = context.gl

  program = createProgram(gl, VERT, FRAG)
  if (!program)
    return null

  vao = gl.createVertexArray()

  gl.useProgram(program)
  for (const name of Object.keys(uniforms) as (keyof typeof uniforms)[]) {
    uniforms[name] = gl.getUniformLocation(program, name)
  }
  startTime = Date.now()

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  return context._tag
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas || !gl)
    return
  const dpr = canvasDpr()
  const w = Math.round(width.value * dpr)
  const h = Math.round(height.value * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
  }
}

function drawFrame() {
  if (!gl || !program || !canvasRef.value)
    return

  resizeCanvas()

  const dpr = canvasDpr()
  const t = isStatic.value ? 3.0 : (Date.now() - startTime) / 1000
  if (t > INTRO_SECONDS)
    introDone.value = true

  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(program)
  gl.bindVertexArray(vao)

  gl.uniform1f(uniforms.u_time, t)
  gl.uniform2f(uniforms.u_resolution, canvasRef.value.width, canvasRef.value.height)
  gl.uniform1f(uniforms.u_hue, hue.value)
  gl.uniform1f(uniforms.u_opacity, props.opacity)
  gl.uniform1f(uniforms.u_dpr, dpr)
  gl.uniform1f(uniforms.u_dark, isDark.value ? 1.0 : 0.0)

  if (isOutside.value || isStatic.value) {
    gl.uniform2f(uniforms.u_mouse, -1, -1)
  }
  else {
    gl.uniform2f(uniforms.u_mouse, elementX.value * dpr, (height.value - elementY.value) * dpr)
  }

  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

const isVisible = ref(true)

const { pause, resume } = useRafFn(() => {
  if (visibility.value === 'hidden' || !isVisible.value)
    return
  drawFrame()
}, {
  immediate: false,
  fpsLimit: () => introDone.value && isOutside.value ? AMBIENT_FPS : null,
})

// A static frame has no loop, so it redraws when its box or theme changes.
watch([width, height, isDark], () => {
  if (isStatic.value)
    drawFrame()
})

let disposed = false

// The field is decoration. It starts once the page has hydrated and the main
// thread is idle, so it never competes with the first paint or hydration.
onNuxtReady(() => {
  if (disposed || gl)
    return

  const mode = initGL()
  if (!mode)
    return

  if (mode === 'software')
    maxDpr = 1
  if (mode === 'software' || prefersReducedMotion.value) {
    isStatic.value = true
    drawFrame()
    return
  }

  if (containerRef.value) {
    intersectionObserver = new IntersectionObserver(
      (entries) => { isVisible.value = entries[0]?.isIntersecting ?? false },
      { threshold: 0 },
    )
    intersectionObserver.observe(containerRef.value)
  }

  resume()
})

onBeforeUnmount(() => {
  disposed = true
  pause()
  intersectionObserver?.disconnect()
  if (gl) {
    if (vao)
      gl.deleteVertexArray(vao)
    if (program)
      gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    aria-hidden="true"
  >
    <canvas
      ref="canvasRef"
      class="size-full"
    />
  </div>
</template>
