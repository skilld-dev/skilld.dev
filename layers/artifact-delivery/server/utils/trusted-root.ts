import { trustedRootConfigSchema, trustedRootSchema } from '../schemas/contracts'

export type TrustedRoot = ReturnType<typeof parseTrustedRoot>

export function parseTrustedRoot(value: string, now: number) {
  const config = trustedRootConfigSchema.parse(JSON.parse(value))
  return trustedRootSchema.parse({
    ...config,
    fetchedAt: new Date(now * 1000).toISOString(),
  })
}
