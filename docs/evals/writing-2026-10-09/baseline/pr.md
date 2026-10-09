# Add category filtering to the reading list

This pull request adds category filtering to Margin, our fictional reading-list app. It uses the existing category field, so users can narrow their saved articles to a single category.

Previously, the list displayed every saved link regardless of the selected category. Now, selecting a category displays only matching links. Selecting All displays the complete list.

Filtering preserves the original order of links and does not change bookmarks. The selected category resets when the page reloads. Search and saved filter preferences are outside the scope of this change.

The result is a more focused reading experience, while keeping the existing interface simple.