/**
 * What a demo's Skill makes, which is how `/skills/demos` groups them. Named
 * by the thing a visitor wants made, not by the kind of work, so a film Skill
 * and a page Skill never share a group. The order is the page order.
 *
 * This module imports nothing, so the recorder script can load it directly.
 */
export const DEMO_GROUPS = [
  {
    makes: 'film',
    label: 'Films and launch videos',
    line: 'Videos a Skill directs and renders in code, from a prompt or a project folder.',
  },
  {
    makes: 'landing-page',
    label: 'Landing pages',
    line: 'A whole page from one prompt.',
  },
  {
    makes: 'ui-component',
    label: 'UI components',
    line: 'One component, with the states and motion the Skill teaches.',
  },
  {
    makes: 'diagram',
    label: 'Diagrams and explainers',
    line: 'Systems and flows drawn so a reader can follow them.',
  },
] as const

export type DemoMakes = typeof DEMO_GROUPS[number]['makes']

export const DEMO_MAKES = DEMO_GROUPS.map(group => group.makes) as [DemoMakes, ...DemoMakes[]]

export interface DemoGroup<T> {
  makes: DemoMakes
  label: string
  line: string
  demos: T[]
}

/** Demos under their group, in page order. A group with no demos is left out. */
export function groupDemos<T extends { makes: DemoMakes }>(demos: readonly T[]): DemoGroup<T>[] {
  return DEMO_GROUPS
    .map(group => ({ makes: group.makes, label: group.label, line: group.line, demos: demos.filter(demo => demo.makes === group.makes) }))
    .filter(group => group.demos.length > 0)
}
