import type { BackgroundWideEvent, WideEventLevel } from '@harlan-zw/nuxt-wide-events/standalone'

export function emitOperationalEvent(event: BackgroundWideEvent, level: WideEventLevel = 'warn'): void {
  event.setLevel(level)
  event.emit()
}
