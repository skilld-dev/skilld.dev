# Add category filtering to the reading list

This pull request adds category filtering to Margin, our fictional reading-list app, using the existing category field on each link.

Previously, the list displayed every saved link regardless of the selected category. Selecting a category now displays only matching links. Selecting All displays the complete list.

Filtering preserves the original order of links and does not change bookmarks. The selected category resets when the page reloads. Search and saved filter preferences are outside the scope of this change.