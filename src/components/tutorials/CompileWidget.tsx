import { useState, useEffect, useCallback } from 'react';
import { getRumocaClient } from '../../lib/rumoca-worker-client';

interface CompileWidgetProps {
  initialSource: string;
  modelName: string;
  defaultBackend?: string;
}

interface Backend {
  name: string;
  label: string;
}

const JSON_BACKEND = { name: '__json__', label: 'JSON DAE IR' };

export default function CompileWidget({ initialSource, modelName, defaultBackend }: CompileWidgetProps) {
  const [source, setSource] = useState(initialSource);
  const [backends, setBackends] = useState<Backend[]>([JSON_BACKEND]);
  const [selectedBackend, setSelectedBackend] = useState(defaultBackend || '__json__');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getRumocaClient();
    client.ready.then(async () => {
      setReady(true);
      try {
        const tplJson = await client.getBuiltinTargets();
        const tpls: string[] = JSON.parse(tplJson);
        setBackends([JSON_BACKEND, ...tpls.map((t) => ({ name: t, label: t }))]);
      } catch { /* ignore */ }
    });
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

  return (
    <div className="my-6 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <select
          value={selectedBackend}
          onChange={(e) => setSelectedBackend(e.target.value)}
          className="px-3 py-1.5 rounded-md border text-sm font-mono focus:outline-none"
          style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {backends.map((b) => (
            <option key={b.name} value={b.name}>{b.label}</option>
          ))}
        </select>
        <button
          onClick={handleCompile}
          disabled={compiling || !ready}
          className="px-4 py-1.5 rounded-md text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {compiling ? 'Compiling...' : !ready ? 'Loading...' : 'Compile'}
        </button>
      </div>

      {/* Source */}
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        rows={source.split('\n').length + 1}
        className="w-full px-4 py-3 font-mono text-sm resize-none focus:outline-none border-b leading-relaxed"
        style={{ backgroundColor: 'var(--color-code-bg)', color: 'var(--color-code-text)', borderColor: 'var(--color-border)', tabSize: 2 }}
      />

      {/* Output */}
      {(output || error || compiling) && (
        <div className="px-4 py-3 max-h-80 overflow-auto" style={{ backgroundColor: 'var(--color-code-bg)' }}>
          {compiling && (
            <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--color-code-text)' }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
              Compiling...
            </div>
          )}
          {error && <pre className="text-red-500 text-sm font-mono whitespace-pre-wrap">{error}</pre>}
          {output && !compiling && <pre className="text-sm font-mono whitespace-pre-wrap" style={{ color: 'var(--color-code-text)' }}>{output}</pre>}
        </div>
      )}
    </div>
  );
}
