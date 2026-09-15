const REQUEST_WORDS = new Set('a an the i my we our you your to for with from in on of and or is are be can could please how do does make help stop fix find'.split(' '))

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
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
