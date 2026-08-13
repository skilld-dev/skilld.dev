export interface SkillMetadataEntry {
  key: string
  value: string
  complex: boolean
}

export interface SkillMetadataPartition {
  visible: SkillMetadataEntry[]
  other: SkillMetadataEntry[]
}

const MAX_VISIBLE_ENTRIES = 3
const MAX_VISIBLE_VALUE_LENGTH = 80

export function partitionMetadataEntries(entries: SkillMetadataEntry[]): SkillMetadataPartition {
  return entries.reduce<SkillMetadataPartition>((partition, entry) => {
    const isShort = entry.value.length <= MAX_VISIBLE_VALUE_LENGTH
    const hasVisibleRoom = partition.visible.length < MAX_VISIBLE_ENTRIES
    return isShort && hasVisibleRoom
      ? { ...partition, visible: [...partition.visible, entry] }
      : { ...partition, other: [...partition.other, entry] }
  }, { visible: [], other: [] })
}
