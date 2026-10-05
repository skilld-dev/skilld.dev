const REQUEST_WORDS = new Set('a an the i my we our you your to for with from in on of and or is are be can could please how do does make help stop fix find'.split(' '))

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/** Match complete query words in one name, regardless of their order. */
export function searchNameMatch(
  skill: { name: string, displayName: string },
  query: string,
): boolean {
  const queryWords = new Set(words(query).filter(word => !REQUEST_WORDS.has(word)))
  return queryWords.size >= 2 && [skill.name, skill.displayName].some((field) => {
    const nameWords = new Set(words(field))
    return [...queryWords].every(word => nameWords.has(word))
  })
}

/** Reward a complete task phrase without changing the semantic query. */
export function searchPhraseBoost(
  skill: { name: string, displayName: string, description: string | null },
  query: string,
): 0 | 1 {
  const phraseWords = words(query).filter(word => !REQUEST_WORDS.has(word))
  if (phraseWords.length < 2)
    return 0

  const phrase = ` ${phraseWords.join(' ')} `
  return [skill.name, skill.displayName, skill.description ?? '']
    .some(field => ` ${words(field).join(' ')} `.includes(phrase))
    ? 1
    : 0
}
