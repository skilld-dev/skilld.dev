# Margin

Margin is a fictional TypeScript package for organizing reading-list links by category.

## Getting started

Import `filterLinks`, then pass it your links and a category. The function returns matching links in their original order. An empty category returns all links.

```ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
```

## Behavior and limits

Category matching is case-sensitive. The function doesn't modify the input array. Margin doesn't fetch URLs or store links; it only filters.