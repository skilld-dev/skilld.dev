# Add category filtering to the reading list

This PR adds category filtering to Margin, our fictional reading-list app. It uses the existing category field, so selecting a category narrows the saved articles to that one.

Previously, the list displayed every saved link regardless of the selected category. Now selecting a category displays only matching links. Selecting All displays the complete list.

Filtering preserves the original order of links and leaves bookmarks unchanged. The selected category resets when the page reloads. Search and saved filter preferences are outside the scope of this change.

The rest of the interface stays as simple as before.