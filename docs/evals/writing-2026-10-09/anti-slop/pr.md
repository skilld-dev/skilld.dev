# Add category filtering to the reading list

This pull request adds category filtering to our fictional reading-list app, Margin. It uses the existing category field, so users can view only the articles in a chosen category.

Previously, the list displayed every saved link regardless of the selected category. Now, selecting a category displays only matching links. Selecting All displays the complete list.

Filtering preserves the original order of links and does not change bookmarks. The selected category resets when the page reloads. Search and saved filter preferences are outside the scope of this change.

The rest of the interface is unchanged.