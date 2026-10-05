const BEHAVIOR_ICONS: Record<string, string> = {
  shell: 'i-lucide-terminal',
  scripts: 'i-lucide-file-code',
  packages: 'i-lucide-package',
  network: 'i-lucide-globe',
  env: 'i-lucide-variable',
  mcp: 'i-lucide-plug',
}

/**
 * The icon for one Skill behavior.
 *
 * Every behavior that needs approval shares one warning shape, so the tier
 * never rests on colour alone.
 */
export function behaviorIcon(behavior: { id: string, tier: 'ask' | 'show' }): string {
  if (behavior.tier === 'ask')
    return 'i-lucide-triangle-alert'
  return BEHAVIOR_ICONS[behavior.id] ?? 'i-lucide-circle-dot'
}
