/**
 * Runtime reduced motion preference check.
 * Use this to disable JS animations (motion-v) when the user prefers reduced motion.
 * CSS transitions are handled by the `prefers-reduced-motion` media query in main.css.
 */
export function useMotionA11y() {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const motionConfig = computed(() =>
    prefersReducedMotion.value
      ? { initial: { opacity: 0 }, enter: { opacity: 1 }, duration: 0 }
      : undefined,
  )

  return { prefersReducedMotion, motionConfig }
}
