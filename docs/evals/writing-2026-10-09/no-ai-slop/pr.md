# Add category filtering to the reading list

This PR adds category filtering to Margin, our fictional reading-list app. Selecting a category now displays only matching links; selecting All displays the complete list. Previously, the list showed every saved link regardless of the selected category.

Filtering preserves the original order of links and does not change bookmarks. The selected category resets when the page reloads. Search and saved filter preferences are out of scope for this change.