import { useState, useEffect, useCallback } from 'react';
import { getRumocaClient } from '../../lib/rumoca-worker-client';

interface PythonWorkflowProps {
  /** Modelica source code */
  initialSource: string;
  /** Model name for compilation */
  modelName: string;
  /** Backend to compile with (e.g. 'casadi', 'sympy') */
  backend: string;
  /** Python code template. Use {generated_code} as placeholder for the compiled output. */
  pythonTemplate: string;
  /** Packages to pip install in the Colab notebook (e.g. ['casadi', 'matplotlib']) */
  pipInstalls?: string[];
  /** Title shown above the Python code block */
  title?: string;
}

function makeNotebookJson(pythonCode: string, pipInstalls: string[]): string {
  const cells: any[] = [];

  if (pipInstalls.length > 0) {
    cells.push({
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: [`!pip install ${pipInstalls.join(' ')}\n`],
    });
  }

  // Split the python code into lines for the notebook cell
  const lines = pythonCode.split('\n').map((line, i, arr) =>
    i < arr.length - 1 ? line + '\n' : line
  );

  cells.push({
    cell_type: 'code',
    execution_count: null,
    metadata: {},
    outputs: [],
    source: lines,
  });

  return JSON.stringify({
    nbformat: 4,
    nbformat_minor: 0,
    metadata: {
      colab: { provenance: [] },
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python' },
    },
    cells,
  }, null, 1);
}

export default function PythonWorkflow({
  initialSource,
  modelName,
  backend,
  pythonTemplate,
  pipInstalls = [],
  title = 'Python Workflow',
}: PythonWorkflowProps) {
  const [source, setSource] = useState(initialSource);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getRumocaClient();
    client.ready.then(() => setReady(true));
  }, []);

  const handleCompile = useCallback(async () => {
    setCompiling(true);
    setError('');
    setGeneratedCode('');
    try {
      const client = getRumocaClient();
      const daeJson = await client.compile(source, modelName);
      const rendered = await client.renderTarget(daeJson, modelName, backend);
      setGeneratedCode(rendered);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setCompiling(false);
    }
  }, [source, modelName, backend]);

  const fullPython = generatedCode
    ? pythonTemplate.replace('{generated_code}', generatedCode)
    : '';

  const handleOpenColab = useCallback(() => {
    if (!fullPython) return;
    const nb = makeNotebookJson(fullPython, pipInstalls);
    const blob = new Blob([nb], { type: 'application/x-ipynb+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_workflow.ipynb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fullPython, pipInstalls, modelName]);

  return (
    <div className="space-y-6">
      {/* Modelica Source Editor */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="px-3 py-1 rounded-md border text-sm font-mono" style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
            {backend}
          </span>
          <button
            onClick={handleCompile}
            disabled={compiling || !ready}
            className="px-4 py-1.5 rounded-md text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >
            {compiling ? 'Compiling...' : !ready ? 'Loading...' : 'Compile'}
          </button>
        </div>

        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          spellCheck={false}
          rows={source.split('\n').length + 1}
          className="w-full px-4 py-3 font-mono text-sm resize-none focus:outline-none leading-relaxed"
          style={{ backgroundColor: 'var(--color-code-bg)', color: 'var(--color-code-text)', borderColor: 'var(--color-border)', tabSize: 2 }}
        />
      </div>

      {/* Error */}
      {error && (
        <pre className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 text-red-500 text-sm font-mono whitespace-pre-wrap">
          {error}
        </pre>
      )}

      {/* Python Output */}
      {fullPython && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</span>
            <button
              onClick={handleOpenColab}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors hover:border-amber-500/60"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#F9AB00"/>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10" fill="#E8710A"/>
                <circle cx="8.5" cy="10" r="3" fill="white"/>
                <circle cx="15.5" cy="10" r="3" fill="white"/>
                <circle cx="8.5" cy="10" r="1.5" fill="#333"/>
                <circle cx="15.5" cy="10" r="1.5" fill="#333"/>
              </svg>
              Open in Colab
            </button>
          </div>

          <div className="px-4 py-3 max-h-[32rem] overflow-auto" style={{ backgroundColor: 'var(--color-code-bg)' }}>
            <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--color-code-text)' }}>
              {fullPython}
            </pre>
          </div>
        </div>
      )}

      {/* Placeholder before compile */}
      {!fullPython && !error && !compiling && (
        <div className="p-6 rounded-xl border border-dashed text-center" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <p className="text-sm">Click <strong>Compile</strong> to generate the Python code from your Modelica model.</p>
        </div>
      )}

      {compiling && (
        <div className="p-6 rounded-xl border text-center" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
          <div className="inline-flex items-center gap-2 text-sm font-mono">
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
            Compiling Modelica and generating Python code...
          </div>
        </div>
      )}
    </div>
  );
}
