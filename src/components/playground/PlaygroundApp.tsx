import { useState, useEffect, useCallback, useRef } from 'react';
import { getRumocaClient } from '../../lib/rumoca-worker-client';
import { examples } from '../../lib/examples';

interface Backend {
  name: string;
  label: string;
}

const JSON_BACKEND = { name: '__json__', label: 'JSON DAE IR' };

export default function PlaygroundApp() {
  const [source, setSource] = useState(examples[0].source);
  const [modelName, setModelName] = useState(examples[0].modelName);
  const [selectedExample, setSelectedExample] = useState(0);
  const [backends, setBackends] = useState<Backend[]>([JSON_BACKEND]);
  const [selectedBackend, setSelectedBackend] = useState('__json__');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const client = getRumocaClient();
    client.ready.then(async () => {
      setReady(true);
      try {
        const v = await client.getVersion();
        setVersion(v);
      } catch { /* ignore */ }
      try {
        const tplJson = await client.getBuiltinTargets();
        const tpls: string[] = JSON.parse(tplJson);
        setBackends([
          JSON_BACKEND,
          ...tpls.map((t) => ({ name: t, label: t })),
        ]);
      } catch { /* ignore */ }
    });
  }, []);

  const handleExampleChange = useCallback((idx: number) => {
    const ex = examples[idx];
    setSelectedExample(idx);
    setSource(ex.source);
    setModelName(ex.modelName);
    setOutput('');
    setError('');
  }, []);

  const handleCompile = useCallback(async () => {
    setCompiling(true);
    setError('');
    setOutput('');
    try {
      const client = getRumocaClient();
      const daeJson = await client.compile(source, modelName);

      if (selectedBackend === '__json__') {
        try {
          setOutput(JSON.stringify(JSON.parse(daeJson), null, 2));
        } catch {
          setOutput(daeJson);
        }
      } else {
        const rendered = await client.renderTarget(daeJson, modelName, selectedBackend);
        setOutput(rendered);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setCompiling(false);
    }
  }, [source, modelName, selectedBackend]);

  const handleCopy = useCallback(() => {
    if (output) {
      navigator.clipboard.writeText(output);
    }
  }, [output]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <select
          value={selectedExample}
          onChange={(e) => handleExampleChange(Number(e.target.value))}
          className="px-3 py-1.5 rounded-md border text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {examples.map((ex, i) => (
            <option key={i} value={i}>{ex.name}</option>
          ))}
        </select>

        <select
          value={selectedBackend}
          onChange={(e) => setSelectedBackend(e.target.value)}
          className="px-3 py-1.5 rounded-md border text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {backends.map((b) => (
            <option key={b.name} value={b.name}>{b.label}</option>
          ))}
        </select>

        <button
          onClick={handleCompile}
          disabled={compiling || !ready}
          className="px-5 py-1.5 rounded-md text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: compiling || !ready ? undefined : 'var(--color-accent)' }}
        >
          {compiling ? 'Compiling...' : !ready ? 'Loading WASM...' : 'Compile'}
        </button>

        {output && (
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-md border text-sm transition-colors"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Copy
          </button>
        )}

        {version && (
          <span className="ml-auto text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
            v{version}
          </span>
        )}
      </div>

      {/* Editor panels */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Source editor */}
        <div className="flex-1 flex flex-col min-h-0 border-b md:border-b-0 md:border-r" style={{ borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-2 text-xs font-mono border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            Modelica Source &mdash; {modelName}
          </div>
          <textarea
            ref={editorRef}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none leading-relaxed"
            style={{ backgroundColor: 'var(--color-code-bg)', color: 'var(--color-code-text)', tabSize: 2 }}
          />
        </div>

        {/* Output panel */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 text-xs font-mono border-b" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
            Output &mdash; {backends.find(b => b.name === selectedBackend)?.label || selectedBackend}
          </div>
          <div className="flex-1 overflow-auto p-4" style={{ backgroundColor: 'var(--color-code-bg)' }}>
            {compiling && (
              <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--color-code-text)' }}>
                <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                Compiling...
              </div>
            )}
            {error && (
              <pre className="text-red-400 text-sm font-mono whitespace-pre-wrap">{error}</pre>
            )}
            {output && !compiling && (
              <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--color-code-text)' }}>{output}</pre>
            )}
            {!output && !error && !compiling && (
              <p className="text-sm font-mono" style={{ color: 'var(--color-text-muted)' }}>
                Click "Compile" to see output.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="px-4 py-2 border-t text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Compilation runs entirely in your browser via WebAssembly. No code is sent to a server.
        </p>
      </div>
    </div>
  );
}
