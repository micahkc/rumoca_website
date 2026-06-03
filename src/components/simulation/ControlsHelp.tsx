import type { InputMode } from '../../lib/input-manager';

interface ControlsHelpProps {
  inputMode: InputMode;
}

/** Tiny inline SVG gamepad diagram with labeled buttons/sticks. */
function GamepadDiagram() {
  const bg = 'rgba(30,20,10,0.6)';
  const outline = 'rgba(200,160,80,0.35)';
  const accent = '#70b8e0';
  const label = '#a89070';
  const btnFill = 'rgba(200,160,80,0.25)';

  return (
    <svg viewBox="0 0 260 170" width="240" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      {/* Controller body */}
      <rect x="30" y="40" width="200" height="90" rx="20" fill={bg} stroke={outline} strokeWidth="1.5" />
      {/* Left grip */}
      <rect x="20" y="70" width="30" height="50" rx="12" fill={bg} stroke={outline} strokeWidth="1.2" />
      {/* Right grip */}
      <rect x="210" y="70" width="30" height="50" rx="12" fill={bg} stroke={outline} strokeWidth="1.2" />

      {/* Left stick */}
      <circle cx="85" cy="85" r="18" fill="none" stroke={outline} strokeWidth="1" />
      <circle cx="85" cy="85" r="8" fill={btnFill} stroke={accent} strokeWidth="1.2" />
      {/* Left stick arrows */}
      <text x="85" y="60" textAnchor="middle" fill={accent} fontSize="8" fontFamily="monospace">↑↓</text>
      <text x="85" y="115" textAnchor="middle" fill={label} fontSize="7" fontFamily="monospace">Throttle</text>
      <text x="58" y="88" textAnchor="middle" fill={accent} fontSize="8" fontFamily="monospace">←→</text>
      <text x="85" y="125" textAnchor="middle" fill={label} fontSize="7" fontFamily="monospace">Yaw</text>

      {/* Right stick */}
      <circle cx="175" cy="85" r="18" fill="none" stroke={outline} strokeWidth="1" />
      <circle cx="175" cy="85" r="8" fill={btnFill} stroke={accent} strokeWidth="1.2" />
      {/* Right stick arrows */}
      <text x="175" y="60" textAnchor="middle" fill={accent} fontSize="8" fontFamily="monospace">↑↓</text>
      <text x="175" y="115" textAnchor="middle" fill={label} fontSize="7" fontFamily="monospace">Pitch</text>
      <text x="202" y="88" textAnchor="middle" fill={accent} fontSize="8" fontFamily="monospace">←→</text>
      <text x="175" y="125" textAnchor="middle" fill={label} fontSize="7" fontFamily="monospace">Roll</text>

      {/* Face buttons (right side) */}
      {/* A / Cross */}
      <circle cx="215" cy="75" r="7" fill={btnFill} stroke={accent} strokeWidth="0.8" />
      <text x="215" y="78" textAnchor="middle" fill={accent} fontSize="7" fontWeight="bold" fontFamily="monospace">A</text>
      <text x="240" y="78" textAnchor="start" fill={label} fontSize="6.5" fontFamily="monospace">Reset</text>

      {/* B / Circle */}
      <circle cx="228" cy="63" r="7" fill={btnFill} stroke={accent} strokeWidth="0.8" />
      <text x="228" y="66" textAnchor="middle" fill={accent} fontSize="7" fontWeight="bold" fontFamily="monospace">B</text>
      <text x="240" y="55" textAnchor="start" fill={label} fontSize="6.5" fontFamily="monospace">Zero</text>

      {/* Start button */}
      <rect x="121" y="72" width="18" height="8" rx="3" fill={btnFill} stroke={accent} strokeWidth="0.8" />
      <text x="130" y="79" textAnchor="middle" fill={accent} fontSize="5.5" fontFamily="monospace">▶</text>
      <text x="130" y="55" textAnchor="middle" fill={label} fontSize="7" fontFamily="monospace">Start</text>
      <text x="130" y="47" textAnchor="middle" fill={accent} fontSize="6.5" fontFamily="monospace">Arm</text>

      {/* Mouse hint */}
      <text x="130" y="155" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7" fontFamily="monospace">
        Scroll = zoom · Drag = orbit
      </text>
    </svg>
  );
}

export default function ControlsHelp({ inputMode }: ControlsHelpProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        zIndex: 10,
        background: 'rgba(30,20,10,0.75)',
        padding: '8px 14px',
        borderRadius: '6px',
        fontSize: '11px',
        lineHeight: 1.6,
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(200,160,80,0.2)',
        maxWidth: '260px',
        fontFamily: 'monospace',
        color: '#eee',
        pointerEvents: 'none',
      }}
    >
      <b style={{ color: '#e8c840' }}>
        Input: <span>{inputMode}</span>
      </b>
      <br />
      {inputMode === 'keyboard' ? (
        <>
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '70px' }}>W / S</span>{' '}
          <span style={{ color: '#a89070' }}>Pitch fwd/back</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '70px' }}>A / D</span>{' '}
          <span style={{ color: '#a89070' }}>Roll left/right</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '70px' }}>Up / Down</span>{' '}
          <span style={{ color: '#a89070' }}>Throttle</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '70px' }}>Left / Right</span>{' '}
          <span style={{ color: '#a89070' }}>Yaw</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '70px' }}>Space</span>{' '}
          <span style={{ color: '#a89070' }}>Arm / Disarm</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '70px' }}>R</span>{' '}
          <span style={{ color: '#a89070' }}>Reset simulation</span>
        </>
      ) : (
        <GamepadDiagram />
      )}
    </div>
  );
}
