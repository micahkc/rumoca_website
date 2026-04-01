import type { InputMode } from '../../lib/input-manager';

interface ControlsHelpProps {
  inputMode: InputMode;
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
        maxWidth: '240px',
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
        <>
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '90px' }}>Right stick</span>{' '}
          <span style={{ color: '#a89070' }}>Roll / Pitch</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '90px' }}>Left stick X</span>{' '}
          <span style={{ color: '#a89070' }}>Yaw</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '90px' }}>Left stick Y</span>{' '}
          <span style={{ color: '#a89070' }}>Throttle ramp</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '90px' }}>A / Cross</span>{' '}
          <span style={{ color: '#a89070' }}>Reset simulation</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '90px' }}>B / Circle</span>{' '}
          <span style={{ color: '#a89070' }}>Zero sticks</span>
          <br />
          <span style={{ color: '#70b8e0', display: 'inline-block', minWidth: '90px' }}>Start</span>{' '}
          <span style={{ color: '#a89070' }}>Arm / Disarm</span>
        </>
      )}
    </div>
  );
}
