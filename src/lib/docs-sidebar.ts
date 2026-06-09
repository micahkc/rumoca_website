import fs from 'node:fs';
import path from 'node:path';

export type DocsCollection = 'user-guide' | 'dev-guide';

export interface SidebarItem {
  title: string;
  slug: string; // relative to collection root, no .md, no leading slash
}

export interface SidebarSection {
  heading: string;
  items: SidebarItem[];
}

export interface Sidebar {
  /** Items appearing before the first `# Heading` in SUMMARY.md. */
  prefix: SidebarItem[];
  sections: SidebarSection[];
}

const LINK_RE = /^\s*-?\s*\[([^\]]+)\]\(\.?\/?([^)]+?)\.md\)/;
const HEADING_RE = /^#\s+(.+?)\s*$/;

/**
 * Parse an mdBook SUMMARY.md into a flat-then-sectioned sidebar.
 *
 * The grammar we handle:
 *   # Summary               — discarded (literal book title)
 *   [Title](./path.md)      — unsectioned item (prefix)
 *   # Section               — starts a new section
 *   - [Title](./path.md)    — item under the current section
 *
 * Indented sub-items are flattened — none of the rumoca SUMMARY files use
 * nesting yet, so this stays simple.
 */
export function parseSummary(content: string): Sidebar {
  const sidebar: Sidebar = { prefix: [], sections: [] };
  let currentSection: SidebarSection | null = null;

  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch && headingMatch[1].toLowerCase() !== 'summary') {
      currentSection = { heading: headingMatch[1], items: [] };
      sidebar.sections.push(currentSection);
      continue;
    }

    const linkMatch = rawLine.match(LINK_RE);
    if (linkMatch) {
      // mdBook conventionally writes a section index as `<dir>/index.md`;
      // Astro's content collection special-cases that into entry.id `<dir>`
      // (no trailing `/index`). Mirror that so sidebar URLs resolve.
      const slug = linkMatch[2]
        .replace(/^\.\//, '')
        .replace(/\.md$/, '')
        .replace(/(^|\/)index$/, '');
      const item: SidebarItem = { title: linkMatch[1], slug };
      if (currentSection) {
        currentSection.items.push(item);
      } else {
        sidebar.prefix.push(item);
      }
    }
  }
  return sidebar;
}

/** Look up the SUMMARY title for a slug. Falls back to undefined. */
export function findSidebarTitle(sidebar: Sidebar, slug: string): string | undefined {
  const all = [...sidebar.prefix, ...sidebar.sections.flatMap((s) => s.items)];
  return all.find((item) => item.slug === slug)?.title;
}

/** Read and parse the SUMMARY.md for a collection. Run at build time. */
export function loadDocsSidebar(collection: DocsCollection): Sidebar {
  const summaryPath = path.resolve('src/content', collection, 'SUMMARY.md');
  if (!fs.existsSync(summaryPath)) {
    return { prefix: [], sections: [] };
  }
  return parseSummary(fs.readFileSync(summaryPath, 'utf8'));
}

/** Flatten the sidebar into ordered prev/next links for a given slug. */
export function getPrevNext(
  sidebar: Sidebar,
  currentSlug: string,
): { prev?: SidebarItem; next?: SidebarItem } {
  const flat: SidebarItem[] = [
    ...sidebar.prefix,
    ...sidebar.sections.flatMap((s) => s.items),
  ];
  const idx = flat.findIndex((item) => item.slug === currentSlug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? flat[idx - 1] : undefined,
    next: idx < flat.length - 1 ? flat[idx + 1] : undefined,
  };
}
