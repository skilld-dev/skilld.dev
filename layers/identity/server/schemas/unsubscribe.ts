import { z } from 'zod'

export const UnsubQuery = z.object({
  t: z.string().min(1),
  /**
   * Which email the link came from.
   *
   * Two lists now run independently: `weekly` is the weekly email, and the
   * default is the older watched-repo digest. Without this the weekly's
   * unsubscribe would turn off the digest instead, which is a different
   * promise from the one the reader clicked.
   */
  list: z.enum(['weekly', 'digest']).default('digest'),
})
