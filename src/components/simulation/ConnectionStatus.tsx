interface ConnectionStatusProps {
  mode: 'wasm-controller' | 'autopilot';
  connected: boolean;
}

export default function ConnectionStatus({ mode, connected }: ConnectionStatusProps) {
  const label = mode === 'wasm-controller'
    ? 'WASM Controller'
    : connected
      ? 'Autopilot Connected'
      : 'Autopilot Disconnected';

  const color = mode === 'wasm-controller'
    ? '#4c4'
    : connected
      ? '#4c4'
      : '#c44';

  return (
    <div
      style={{
        position: 'fixed',
        top: '76px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: 'rgba(30,20,10,0.75)',
        padding: '4px 12px',
        borderRadius: '6px',
        fontSize: '12px',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(200,160,80,0.2)',
        fontFamily: 'monospace',
        color,
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
}
