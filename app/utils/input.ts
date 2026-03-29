/** Check if an event target is an editable element (input, textarea, contenteditable) */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA')
    return true
  return target.isContentEditable
}

/** Check if a key was pressed without any modifier keys */
export function isKeyWithoutModifiers(event: KeyboardEvent, key: string): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
    return false
  return event.key.toLowerCase() === key.toLowerCase()
}
