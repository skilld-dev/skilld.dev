# Margin

Margin is a fictional TypeScript package for managing reading lists. It filters links by category so you can organize a reading list in your own app.

## Getting started

Import `filterLinks` and pass it your links and the category you want:

```ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
```

The function returns matching links in their original order. Passing an empty category returns all links.

## Notes

Category matching is case-sensitive. `filterLinks` does not modify the input array. Margin does not fetch URLs or store links; it only filters the array you pass in.