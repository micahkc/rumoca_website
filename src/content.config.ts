import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// SUMMARY.md is the table-of-contents, not a renderable page — exclude it
// from the collection. It's read directly by lib/docs-sidebar.ts to build
// the sidebar nav.
const docsGlob = (base: string) =>
  glob({ pattern: ['**/*.md', '!SUMMARY.md'], base });

export const collections = {
  'user-guide': defineCollection({
    loader: docsGlob('./src/content/user-guide'),
  }),
  'dev-guide': defineCollection({
    loader: docsGlob('./src/content/dev-guide'),
  }),
};
