export type EnvironmentType = 'desert' | 'forest' | 'arctic';
export type AircraftType = 'quadrotor' | 'fixedwing' | 'rover';

interface ConfigPanelProps {
  environment: EnvironmentType;
  aircraft: AircraftType;
  onEnvironmentChange: (env: EnvironmentType) => void;
  onAircraftChange: (ac: AircraftType) => void;
  loading: boolean;
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: '76px',
  right: '10px',
  zIndex: 10,
  background: 'rgba(30,20,10,0.85)',
  padding: '12px 16px',
  borderRadius: '8px',
  fontSize: '12px',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(200,160,80,0.2)',
  fontFamily: 'monospace',
  color: '#eee',
  minWidth: '180px',
};

const labelStyle: React.CSSProperties = {
  color: '#a89070',
  fontWeight: 'bold',
  display: 'block',
  marginTop: '8px',
  marginBottom: '4px',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

function RadioGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {options.map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: '2px 4px',
            borderRadius: '4px',
            background: opt.value === value ? 'rgba(232,200,64,0.15)' : 'transparent',
            color: opt.value === value ? '#e8c840' : '#bbb',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <input
            type="radio"
            checked={opt.value === value}
            onChange={() => onChange(opt.value)}
            disabled={disabled}
            style={{ accentColor: '#e8c840', margin: 0 }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default function ConfigPanel({
  environment,
  aircraft,
  onEnvironmentChange,
  onAircraftChange,
  loading,
}: ConfigPanelProps) {
  return (
    <div style={panelStyle}>
      <div style={{ color: '#e8c840', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
        Configuration
      </div>

      <span style={labelStyle}>Environment</span>
      <RadioGroup
        options={[
          { value: 'desert' as EnvironmentType, label: 'Desert' },
          { value: 'forest' as EnvironmentType, label: 'Forest' },
          { value: 'arctic' as EnvironmentType, label: 'Arctic' },
        ]}
        value={environment}
        onChange={onEnvironmentChange}
        disabled={loading}
      />

      <span style={labelStyle}>Aircraft</span>
      <RadioGroup
        options={[
          { value: 'quadrotor' as AircraftType, label: 'Quadrotor' },
          { value: 'fixedwing' as AircraftType, label: 'Fixed Wing' },
          { value: 'rover' as AircraftType, label: 'Rover' },
        ]}
        value={aircraft}
        onChange={onAircraftChange}
        disabled={loading}
      />

      {loading && (
        <div style={{ color: '#ff0', marginTop: '8px', fontSize: '11px' }}>
          Loading...
        </div>
      )}
    </div>
  );
}
