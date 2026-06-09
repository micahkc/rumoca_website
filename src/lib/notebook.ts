import fs from 'node:fs';
import path from 'node:path';
import katex from 'katex';
import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';

/**
 * Minimal Jupyter notebook (.ipynb v4) types — just the parts we actually
 * touch. The viewer ignores anything it doesn't recognize, so a partial
 * model is intentional.
 */

type MimeBundle = Record<string, string | string[]>;

export interface NotebookOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  name?: string;                  // for 'stream' (stdout/stderr)
  text?: string | string[];       // for 'stream' and 'error'
  data?: MimeBundle;              // for execute_result/display_data
  ename?: string;                 // for 'error'
  evalue?: string;
  traceback?: string[];
}

export interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  outputs?: NotebookOutput[];
  execution_count?: number | null;
}

export interface Notebook {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
}

export interface RenderedCell {
  type: 'markdown' | 'code';
  /** For markdown: rendered HTML. For code: raw source string. */
  content: string;
  outputs?: RenderedOutput[];
  executionCount?: number | null;
}

export interface RenderedOutput {
  kind: 'text' | 'html' | 'image-png' | 'image-svg' | 'latex' | 'error';
  /** Body for text/html/svg/latex/error. data:URL for image-png. */
  body: string;
}

const md = new Marked();
md.use(markedKatex({ throwOnError: false, output: 'html' }));

/**
 * Render a Jupyter text/latex payload to KaTeX HTML at build time.
 *
 * Notebook text/latex outputs from `display(Math(...))` come wrapped in
 * `$...$` or `$$...$$` (and IPython often adds `\displaystyle`). KaTeX wants
 * the raw expression with no delimiters, so we strip them before rendering
 * and prefer `displayMode` to match how Jupyter shows these.
 */
function renderLatex(raw: string): string {
  let body = raw.trim();
  let display = false;
  if (body.startsWith('$$') && body.endsWith('$$')) {
    body = body.slice(2, -2).trim();
    display = true;
  } else if (body.startsWith('$') && body.endsWith('$')) {
    body = body.slice(1, -1).trim();
    display = true; // `display(Math(...))` is rendered in display style by Jupyter
  }
  try {
    return katex.renderToString(body, {
      throwOnError: false,
      displayMode: display,
      output: 'html',
    });
  } catch {
    return `<code>${raw.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</code>`;
  }
}

function asString(source: string | string[]): string {
  return Array.isArray(source) ? source.join('') : source;
}

function pickOutput(out: NotebookOutput): RenderedOutput[] {
  if (out.output_type === 'stream') {
    return [{ kind: 'text', body: asString(out.text ?? '') }];
  }
  if (out.output_type === 'error') {
    // strip ANSI escape sequences from tracebacks
    // eslint-disable-next-line no-control-regex
    const ansi = /\x1b\[[0-9;]*m/g;
    const body = (out.traceback ?? []).join('\n').replace(ansi, '');
    return [{ kind: 'error', body: body || `${out.ename}: ${out.evalue}` }];
  }
  const data = out.data ?? {};
  // Prefer rich displays in this order
  if (data['image/png']) {
    return [{ kind: 'image-png', body: `data:image/png;base64,${asString(data['image/png'])}` }];
  }
  if (data['image/svg+xml']) {
    return [{ kind: 'image-svg', body: asString(data['image/svg+xml']) }];
  }
  if (data['text/html']) {
    return [{ kind: 'html', body: asString(data['text/html']) }];
  }
  if (data['text/latex']) {
    return [{ kind: 'latex', body: renderLatex(asString(data['text/latex'])) }];
  }
  if (data['text/plain']) {
    return [{ kind: 'text', body: asString(data['text/plain']) }];
  }
  return [];
}

/** Read a .ipynb from disk and pre-render markdown cells to HTML. */
export function loadNotebook(notebookPath: string): { cells: RenderedCell[] } {
  const abs = path.isAbsolute(notebookPath)
    ? notebookPath
    : path.resolve(process.cwd(), notebookPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const nb = JSON.parse(raw) as Notebook;

  const cells: RenderedCell[] = [];
  for (const cell of nb.cells) {
    if (cell.cell_type === 'markdown') {
      cells.push({
        type: 'markdown',
        content: md.parse(asString(cell.source)) as string,
      });
    } else if (cell.cell_type === 'code') {
      const outputs = (cell.outputs ?? []).flatMap(pickOutput);
      cells.push({
        type: 'code',
        content: asString(cell.source),
        outputs,
        executionCount: cell.execution_count ?? null,
      });
    }
  }
  return { cells };
}
