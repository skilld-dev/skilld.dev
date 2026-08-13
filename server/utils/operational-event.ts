import type { StandaloneWideEvent, StandaloneWideEventLevel } from '@harlan-zw/nuxt-wide-events/standalone'

export function emitOperationalEvent(event: StandaloneWideEvent, level: StandaloneWideEventLevel = 'warn'): void {
  event.setLevel(level)
  event.emit()
}
