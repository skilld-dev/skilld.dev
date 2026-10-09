# Add category filtering to the reading list

This PR adds category filtering to Margin, our fictional reading-list app. The list previously showed every saved link regardless of the selected category. Selecting a category now shows only matching links; selecting All shows the complete list.

Filtering preserves the original order of links and doesn't change bookmarks. The selected category resets when the page reloads. Search and saved filter preferences are out of scope for this change, and the rest of the interface is unchanged.