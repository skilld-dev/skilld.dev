# Margin

Margin is a fictional TypeScript package for managing reading lists. It provides a small API for organizing links by category.

## Getting started

Import `filterLinks` and pass it your links and the category you want. The function returns matching links in their original order. An empty category returns all links.

```ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
```

## Notes

Category matching is case-sensitive. The function does not modify the input array. Margin does not fetch URLs or store links. Margin filters links and does nothing else.