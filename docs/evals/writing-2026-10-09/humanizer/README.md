# Margin

Margin is a fictional TypeScript package for managing reading lists. Its API organizes links by category.

## Getting started

Import `filterLinks` and pass it your links and the category you want. The function returns matching links in their original order. Passing an empty category returns all links.

```ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
```

## Notes

Category matching is case-sensitive. The function does not modify the input array. Margin does not fetch URLs or store links. It is only a filtering function.