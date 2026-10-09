import type { WritingDemo } from '#shared/writing-demo'

/** Candidates for future recordings. All rows share the same UI fixtures. */
export const writingDemoSkills = [
  { owner: 'blader', repo: 'humanizer', name: 'humanizer' },
  { owner: 'hardikpandya', repo: 'stop-slop', name: 'stop-slop' },
  { owner: 'petergyang', repo: 'no-ai-slop', name: 'no-ai-slop' },
  { owner: 'elithrar', repo: 'dotfiles', name: 'anti-slop' },
  { owner: 'kmaida', repo: 'deslop-skills', name: 'deslop-writing' },
  { owner: 'harlan-zw', repo: 'brundlefly', name: 'write-human' },
] as const

/** Handwritten UI fixtures. These are not recordings or results from any Skill. */
export const writingDemoExample: WritingDemo = {
  documents: [
    {
      id: 'article',
      format: 'article',
      label: 'Blog article',
      original: `# Keeping a reading list that works for you

In today's fast-paced digital landscape, managing a reading list has become an increasingly important part of staying informed. By leveraging a thoughtful approach, you can transform a collection of links into a valuable resource for learning and growth.

## A streamlined approach

It's worth noting that a reading list doesn't need to be complicated. Our fictional reading-list app, Margin, stores a title, URL, and category for each link. You can filter by category and bookmark items you want to return to. Everything stays in your browser. There is no account or cloud sync.

## Building better habits

Furthermore, a weekly review can help you navigate the ever-growing collection of articles. Remove links you no longer want to read. Keep the ones that connect to a project you are working on.

Ultimately, the goal is to create a seamless reading experience that empowers you to make the most of your time. A small, focused list can be more useful than an extensive collection you never open.`,
      baseline: `# Keep your reading list small

A reading list is useful when you return to it. Saving more links does not help if you never open them.

Margin is a fictional reading-list app. It stores each link's title, URL, and category. Category filters help you find a topic, and bookmarks let you mark items to revisit.

Your list stays in your browser. There is no account or cloud sync.

Review the list once a week. Remove articles you no longer want to read and keep those related to your current projects.

A short list you use is more useful than a long list you ignore.`,
      output: `# A reading list you might actually read

You save an article, then another. A month later, the list is a second inbox.

Keep the links that help with something you're working on. Delete the ones that no longer interest you. Give the list a quick look once a week.

Margin, our fictional reading-list app, keeps three things for each link: its title, URL, and category. Filter by category when you want a topic. Bookmark a link when you want to return to it.

The list stays in your browser. No account, no cloud sync. If you need it on another device, that limitation matters.

You don't need to finish the list. You need to find something worth reading when you have time.`,
    },
    {
      id: 'readme',
      format: 'readme',
      label: 'Package README',
      original: `# Margin

Margin is a fictional TypeScript package designed to streamline the management of reading lists. It provides a robust yet intuitive API for organizing links by category, enabling developers to create seamless reading experiences.

## Getting started

To begin leveraging Margin, import \`filterLinks\` and pass your links and the desired category. The function returns matching links in their original order. Passing an empty category returns all links.

\`\`\`ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
\`\`\`

## Important considerations

It's important to note that category matching is case-sensitive. The function does not modify the input array. Margin does not fetch URLs or store links. It is solely a filtering function, making it a valuable addition to your toolkit.`,
      baseline: `# Margin

Margin is a fictional TypeScript package for filtering reading-list links by category.

## Usage

\`\`\`ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
\`\`\`

Matching is case-sensitive. An empty category returns all links. Results keep their original order, and the input array is not modified.

Margin does not fetch URLs or store links.`,
      output: `# Margin

Filter a reading list by category. This is a fictional TypeScript package used for this demo.

\`\`\`ts
import { filterLinks } from 'margin'

const links = [
  { title: 'CSS notes', url: 'https://example.com/css', category: 'CSS' },
  { title: 'TypeScript notes', url: 'https://example.com/ts', category: 'TypeScript' },
]

const cssLinks = filterLinks(links, 'CSS')
\`\`\`

\`filterLinks(links, category)\` returns matching links in their original order. It leaves the input array alone.

- Categories are case-sensitive. \`CSS\` and \`css\` differ.
- An empty category returns all links.
- The function does not fetch URLs or store links.`,
    },
    {
      id: 'pr',
      format: 'pr',
      label: 'PR description',
      original: `# Add category filtering to the reading list

This pull request introduces a streamlined category filtering experience to our fictional reading-list app, Margin. By leveraging the existing category field, users can now navigate their saved articles with greater ease and efficiency.

Previously, the list displayed every saved link regardless of the selected category. With this enhancement, selecting a category displays only matching links. Selecting All displays the complete list.

It's worth noting that filtering preserves the original order of links and does not change bookmarks. The selected category resets when the page reloads. Search and saved filter preferences are outside the scope of this change.

Ultimately, this improvement provides a more focused and intuitive reading experience while maintaining the simplicity of the existing interface.`,
      baseline: `# Add category filtering to the reading list

Margin is a fictional reading-list app. Its list previously showed every saved link, regardless of the selected category.

Selecting a category now shows matching links. Selecting All shows the complete list.

Filtering preserves link order and bookmarks. The selected category resets on reload.

This change does not include search or saved filter preferences.`,
      output: `# Add category filtering to the reading list

Selecting a category in Margin now shows its links. Previously, the list showed every link regardless of the selection. All restores the full list.

Link order and bookmarks stay the same. Reloading the page resets the selected category.

Search and saved filter preferences are outside this change.

Margin is a fictional app used for this demo.`,
    },
  ],
}
