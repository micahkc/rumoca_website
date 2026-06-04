import type { SimulationSource } from '../../lib/simulation-source';
import type { InputMode, RCState } from '../../lib/input-manager';

interface HUDProps {
  source: SimulationSource | null;
  rc: RCState;
  inputMode: InputMode;
  status: string;
  /** Armed flag — only meaningful when the model exposes an `armed` input
   *  (e.g. QuadrotorAcro); pass `undefined` to hide the badge. */
  armed?: boolean;
}

export default function HUD({ source, rc, inputMode, status, armed }: HUDProps) {
  const t = source?.time ?? 0;
  const px = source?.get('px') ?? 0;
  const py = source?.get('py') ?? 0;
  const pz = source?.get('pz') ?? 0;
  const vx = source?.get('vx') ?? 0;
  const vy = source?.get('vy') ?? 0;
  const vz = source?.get('vz') ?? 0;
  const q0 = source?.get('q0') ?? 1;
  const q1 = source?.get('q1') ?? 0;
  const q2 = source?.get('q2') ?? 0;
  const q3 = source?.get('q3') ?? 0;
  const alt = -pz;
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const roll = Math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1 * q1 + q2 * q2)) * (180 / Math.PI);
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (q0 * q2 - q3 * q1)))) * (180 / Math.PI);

  return (
    <div
      style={{
        position: 'fixed',
        top: '76px',
        left: '10px',
        zIndex: 10,
        background: 'rgba(30,20,10,0.75)',
        padding: '10px 14px',
        borderRadius: '6px',
        fontSize: '13px',
        lineHeight: 1.6,
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(200,160,80,0.2)',
        fontFamily: 'monospace',
        color: '#eee',
        pointerEvents: 'none',
      }}
    >
      <b style={{ color: '#e8c840' }}>{status}</b>
      <br />
      <span style={{ color: '#a89070' }}>t:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>{t.toFixed(2)}</span>s
      <br />
      <span style={{ color: '#a89070' }}>pos NED:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>
        {px.toFixed(1)}, {py.toFixed(1)}, {pz.toFixed(1)}
      </span>
      <br />
      <span style={{ color: '#a89070' }}>alt:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>{alt.toFixed(2)}</span>m
      <br />
      <span style={{ color: '#a89070' }}>vel:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>{speed.toFixed(2)}</span> m/s
      <br />
      <span style={{ color: '#a89070' }}>roll:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>{roll.toFixed(1)}</span>&deg;{' '}
      <span style={{ color: '#a89070' }}>pitch:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>{pitch.toFixed(1)}</span>&deg;
      <br />
      <span style={{ color: '#a89070' }}>RC:</span>{' '}
      <span style={{ color: '#e8c840', fontWeight: 'bold' }}>
        T:{rc.throttle.toFixed(2)} P:{rc.pitch.toFixed(2)} R:{rc.roll.toFixed(2)} Y:{rc.yaw.toFixed(2)}
      </span>
      <br />
      <span style={{ color: '#a89070' }}>input:</span>{' '}
      <span style={{ color: '#70b8e0', fontWeight: 'bold' }}>{inputMode}</span>
      {armed !== undefined && (
        <>
          <br />
          <span style={{ color: '#a89070' }}>armed:</span>{' '}
          <span style={{ color: armed ? '#4c4' : '#c44', fontWeight: 'bold' }}>
            {armed ? 'ARMED (Space to disarm)' : 'DISARMED (Space to arm)'}
          </span>
        </>
      )}
    </div>
  );
}
