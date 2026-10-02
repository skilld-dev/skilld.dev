import { readonly, ref } from 'vue'
import { z } from 'zod'

const issuedTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
})

export interface TokenInput {
  label: string
  ttl_days?: number
}

export type TokenCreationState
  = | { _tag: 'idle' }
    | { _tag: 'creating' }
    | { _tag: 'created', token: z.infer<typeof issuedTokenSchema> }
    | { _tag: 'failed' }

/** Keeps the one-time credential in this page's memory. */
export function useTokenCreation(request: (input: TokenInput) => Promise<unknown>) {
  const state = ref<TokenCreationState>({ _tag: 'idle' })

  async function create(input: TokenInput): Promise<void> {
    if (state.value._tag === 'creating' || state.value._tag === 'created')
      return
    state.value = { _tag: 'creating' }
    await request(input)
      .then((answer) => {
        state.value = { _tag: 'created', token: issuedTokenSchema.parse(answer) }
      })
      .catch((cause: unknown) => {
        console.warn('[token-creation] Could not create token:', cause)
        state.value = { _tag: 'failed' }
      })
  }

  return { state: readonly(state), create }
}
