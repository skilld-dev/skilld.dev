import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

export interface DiscoveredScheduledTask {
  name: string
  cron: string
  sourcePath: string
}

function staticStringProperty(
  object: ts.ObjectLiteralExpression,
  propertyName: string,
): string | null {
  const properties = object.properties.filter((property): property is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(property))
      return false
    const name = property.name
    return (ts.isIdentifier(name) || ts.isStringLiteral(name))
      && name.text === propertyName
  })
  if (properties.length !== 1)
    return null
  const initializer = properties[0]!.initializer
  return ts.isStringLiteral(initializer) && initializer.text.trim()
    ? initializer.text
    : null
}

function parseScheduledTaskSource(
  source: string,
  sourcePath: string,
): DiscoveredScheduledTask | null {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const calls: ts.CallExpression[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'defineScheduledTask') {
      calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (!calls.length)
    return null

  const call = calls.length === 1 ? calls[0] : null
  const argument = call?.arguments.length === 1 ? call.arguments[0] : null
  const definition = argument && ts.isObjectLiteralExpression(argument) ? argument : null
  const name = definition ? staticStringProperty(definition, 'name') : null
  const cron = definition ? staticStringProperty(definition, 'cron') : null
  if (!definition || !name || !cron) {
    throw new Error(
      `Unable to parse exactly one static scheduled task name and cron in ${sourcePath}`,
    )
  }
  return { name, cron, sourcePath }
}

function filesBelow(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name)
    if (entry.isDirectory())
      return filesBelow(path)
    if (!entry.isFile()
      || !entry.name.endsWith('.ts')
      || entry.name.endsWith('.spec.ts')
      || entry.name.endsWith('.test.ts')
      || entry.name.endsWith('.d.ts')) {
      return []
    }
    return [path]
  })
}

function taskFiles(projectRoot: string): string[] {
  const roots = [
    resolve(projectRoot, 'layers/artifact-delivery/server/tasks'),
    resolve(projectRoot, 'layers/identity/server/tasks'),
    resolve(projectRoot, 'layers/registry/server/tasks'),
    resolve(projectRoot, 'server/tasks'),
  ]
  return roots.flatMap((root) => {
    try {
      return filesBelow(root)
    }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null
      if (code === 'ENOENT')
        return []
      throw error
    }
  })
}

export function discoverScheduledTasks(projectRoot: string): DiscoveredScheduledTask[] {
  const tasks = taskFiles(projectRoot).flatMap((sourcePath) => {
    const source = readFileSync(sourcePath, 'utf8')
    const task = parseScheduledTaskSource(source, sourcePath)
    return task ? [task] : []
  })
  const names = new Set<string>()
  for (const task of tasks) {
    if (names.has(task.name))
      throw new Error(`duplicate scheduled task name: ${task.name}`)
    names.add(task.name)
  }
  return tasks.sort((left, right) => left.name.localeCompare(right.name))
}

export function parseGeneratedCrons(source: string): string[] {
  const assignment = source.match(/\bcrons\s*=\s*\[([^\]]*)\]/)
  if (!assignment)
    throw new Error('generated schedule file has no crons assignment')
  const crons = [...assignment[1]!.matchAll(/"([^"]+)"/g)].map(match => match[1]!)
  if (!crons.length)
    throw new Error('generated schedule file has no cron values')
  return [...new Set(crons)].sort()
}

export function renderScheduledTasksDocument(
  projectRoot: string,
  tasks: DiscoveredScheduledTask[],
): string {
  const rows = tasks.map(task =>
    `| \`${task.name}\` | \`${task.cron}\` | \`${relative(projectRoot, task.sourcePath)}\` |`,
  )
  const uniqueCrons = new Set(tasks.map(task => task.cron)).size
  return [
    '# Scheduled tasks',
    '',
    'Generated from literal `defineScheduledTask` declarations. Run `pnpm cron:docs` after schedule changes.',
    '',
    `Tasks: ${tasks.length}. Unique Cloudflare triggers: ${uniqueCrons}.`,
    '',
    '| Task | Cron | Source |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

export function parseScheduledTasksDocument(source: string, projectRoot = process.cwd()): DiscoveredScheduledTask[] {
  const tasks = [...source.matchAll(
    /^\| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|$/gm,
  )].map(match => ({
    name: match[1]!,
    cron: match[2]!,
    sourcePath: resolve(projectRoot, match[3]!),
  }))
  if (!tasks.length)
    throw new Error('docs/arch/cron.md has no generated scheduled task rows')
  return tasks.sort((left, right) => left.name.localeCompare(right.name))
}
