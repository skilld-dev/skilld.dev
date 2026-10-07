/**
 * What a demo's Skill makes, which is how `/skills/demos` groups them. Named
 * by the thing a visitor wants made, not by the kind of work, so a film Skill
 * and a page Skill never share a group. The order is the page order. `noun`
 * names one demo of the group, in a demo page title.
 *
 * This module imports nothing, so the recorder script can load it directly.
 */
export const DEMO_GROUPS = [
  {
    makes: 'film',
    noun: 'film',
    label: 'Films and launch videos',
    line: 'Videos a Skill directs and renders in code, from a prompt or a project folder.',
  },
  {
    makes: 'landing-page',
    noun: 'landing page',
    label: 'Landing pages',
    line: 'A whole page from one prompt.',
  },
  {
    makes: 'ui-component',
    noun: 'UI component',
    label: 'UI components',
    line: 'One component, with the states and motion the Skill teaches.',
  },
  {
    makes: 'diagram',
    noun: 'diagram',
    label: 'Diagrams and explainers',
    line: 'Systems and flows drawn so a reader can follow them.',
  },
  {
    makes: 'slides',
    noun: 'slide deck',
    label: 'Slides and decks',
    line: 'A talk or a pitch as a deck you can click through.',
  },
  {
    makes: 'chart',
    noun: 'chart',
    label: 'Charts and dashboards',
    line: 'Data drawn so the point lands at a glance.',
  },
  {
    makes: 'game',
    noun: 'game',
    label: 'Games and playables',
    line: 'Small games you can play right here.',
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

/** One demo of the group, such as `landing page`. */
export function demoNoun(makes: DemoMakes): string {
  return DEMO_GROUPS.find(group => group.makes === makes)?.noun ?? 'demo'
}
