import type { MaybeRefOrGetter, Ref } from 'vue'
import {
  useDocumentVisibility,
  useIntersectionObserver,
  usePreferredReducedMotion,
  useRafFn,
  useResizeObserver,
} from '@vueuse/core'
import { isSoftwareRenderer, webglRendererName } from '~/utils/webgl-context'

/** The design tokens a texture paints with, read from the page. */
export interface TextureColors {
  ink: string
  muted: string
  faint: string
  /** The one rose dot. */
  dot: string
  /** The mono font stack, for textures that draw letters. */
  mono: string
}

/**
 * One texture. The composable owns the canvas; the scene owns the picture.
 * Sizes are CSS pixels, times are seconds.
 */
export interface TextureScene {
  /** Recompute geometry for a new box. */
  layout: (width: number, height: number) => void
  /** Paint one whole frame. `still` is true for the one frame of a texture that does not move. */
  draw: (ctx: CanvasRenderingContext2D, time: number, colors: TextureColors, still: boolean) => void
  /** The time a still frame shows. */
  restTime: number
  /** The time the animated clock starts from. Defaults to `restTime`. */
  startTime?: number
}

/** Textures step at 4 Hz or slower, so 20 fps reads as smooth. */
const FPS = 20
const MAX_DPR = 2

const TOKENS = {
  ink: ['--ui-text', '#57534e'],
  muted: ['--ui-text-muted', '#78716c'],
  faint: ['--ui-text-dimmed', '#a8a29e'],
  dot: ['--brand-dot', '#f43f5e'],
} as const

let softwareRenderer: boolean | undefined

/**
 * Whether the browser draws without a GPU. A canvas there costs main-thread
 * time on every frame, so textures show one still frame instead.
 *
 * A browser that refuses an accelerated WebGL context counts as software. The
 * probe runs once per page and releases its context straight away.
 */
function rendersInSoftware(): boolean {
  if (softwareRenderer !== undefined)
    return softwareRenderer
  const probe = document.createElement('canvas')
  const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
  softwareRenderer = !gl || isSoftwareRenderer(webglRendererName(gl))
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  return softwareRenderer
}

/**
 * The canvas can only paint a colour it can parse. A token it cannot read
 * (an old browser and `oklch()`) falls back to a fixed warm stone.
 */
function paintable(ctx: CanvasRenderingContext2D, value: string, fallback: string): string {
  if (!value)
    return fallback
  ctx.fillStyle = '#000000'
  ctx.fillStyle = value
  const onBlack = ctx.fillStyle
  ctx.fillStyle = '#ffffff'
  ctx.fillStyle = value
  return onBlack === ctx.fillStyle ? value : fallback
}

/**
 * The canvas lifecycle every brand texture shares.
 *
 * - Starts after hydration, once the main thread is idle (`onNuxtReady`).
 * - Sizes the canvas to its container at a device pixel ratio capped at 2.
 * - Animates at about 20 fps, and pauses offscreen or in a hidden tab.
 * - Draws one still frame under reduced motion or a software renderer, at 1x
 *   for the software renderer.
 * - Reads the colour tokens again when the colour mode changes, and redraws.
 */
export function useTextureCanvas(
  container: Ref<HTMLElement | undefined>,
  canvas: Ref<HTMLCanvasElement | undefined>,
  scene: MaybeRefOrGetter<TextureScene>,
) {
  const reducedMotion = usePreferredReducedMotion()
  const visibility = useDocumentVisibility()
  const colorMode = useColorMode()

  const ready = ref(false)
  const software = ref(false)
  const onScreen = ref(false)
  const still = computed(() => software.value || reducedMotion.value === 'reduce')

  let ctx: CanvasRenderingContext2D | null = null
  let colors: TextureColors | null = null
  let width = 0
  let height = 0
  let startedAt = 0
  let disposed = false

  function readColors() {
    const el = container.value
    if (!ctx || !el)
      return
    const style = getComputedStyle(el)
    const read = ([token, fallback]: readonly [string, string]) => paintable(ctx!, style.getPropertyValue(token).trim(), fallback)
    colors = {
      ink: read(TOKENS.ink),
      muted: read(TOKENS.muted),
      faint: read(TOKENS.faint),
      dot: read(TOKENS.dot),
      mono: style.getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace',
    }
  }

  function resize() {
    const el = container.value
    const target = canvas.value
    if (!ctx || !el || !target)
      return
    const box = el.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, software.value ? 1 : MAX_DPR)
    width = box.width
    height = box.height
    target.width = Math.max(1, Math.round(width * dpr))
    target.height = Math.max(1, Math.round(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (width && height)
      toValue(scene).layout(width, height)
  }

  function frame() {
    if (!ready.value || !ctx || !colors || !width || !height)
      return
    const current = toValue(scene)
    const time = still.value
      ? current.restTime
      : (current.startTime ?? current.restTime) + (performance.now() - startedAt) / 1000
    current.draw(ctx, time, colors, still.value)
  }

  const { pause, resume } = useRafFn(frame, { immediate: false, fpsLimit: FPS })

  const running = computed(() => ready.value && !still.value && onScreen.value && visibility.value === 'visible')
  watch(running, (isRunning) => {
    if (isRunning)
      resume()
    else
      pause()
  })
  // A still frame has no loop, so it redraws on its own when it stops moving.
  watch(still, frame)

  useIntersectionObserver(container, ([entry]) => {
    onScreen.value = entry?.isIntersecting ?? false
  })
  useResizeObserver(container, () => {
    resize()
    frame()
  })
  // The colour mode plugin swaps the root class before post-flush watchers run.
  watch(() => colorMode.value, () => {
    readColors()
    frame()
  }, { flush: 'post' })
  watch(() => toValue(scene), () => {
    resize()
    frame()
  })

  onNuxtReady(() => {
    if (disposed || ready.value)
      return
    ctx = canvas.value?.getContext('2d') ?? null
    if (!ctx)
      return
    software.value = rendersInSoftware()
    readColors()
    resize()
    startedAt = performance.now()
    ready.value = true
    frame()
    // Letters drawn before the mono font loads would keep the fallback face.
    void document.fonts?.ready.then(frame)
  })

  onBeforeUnmount(() => {
    disposed = true
    pause()
  })

  return { still, ready }
}
