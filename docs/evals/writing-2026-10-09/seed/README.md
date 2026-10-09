# Margin

Margin is a fictional TypeScript package designed to streamline the management of reading lists. It provides a robust yet intuitive API for organizing links by category, enabling developers to create seamless reading experiences.

## Getting started

To begin leveraging Margin, simply import `filterLinks` and pass your links and the desired category. It's worth noting that the function returns matching links in their original order. Furthermore, passing an empty category returns all links.

```ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
```

## Important considerations

It's important to note that category matching is case-sensitive. Moreover, the function does not modify the input array. It's also worth highlighting that Margin does not fetch URLs or store links. Ultimately, Margin is solely a filtering function, making it a valuable addition to your toolkit.