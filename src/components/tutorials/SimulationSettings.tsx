import React from "react";

interface SimulationSettingsProps {
  tEnd: number;
  dt: number;
  solver: string;
  onTEndChange: (v: number) => void;
  onDtChange: (v: number) => void;
  onSolverChange: (v: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: 80,
  padding: "4px 6px",
  fontSize: "0.8rem",
  border: "1px solid var(--color-border)",
  borderRadius: 4,
  color: "var(--color-text)",
  backgroundColor: "var(--color-surface)",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: 90,
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--color-text-muted)",
};

export default function SimulationSettings({
  tEnd,
  dt,
  solver,
  onTEndChange,
  onDtChange,
  onSolverChange,
}: SimulationSettingsProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <label style={labelStyle}>Duration</label>
        <input
          type="number"
          style={inputStyle}
          value={tEnd}
          step={0.1}
          min={0.01}
          onChange={(e) => onTEndChange(parseFloat(e.target.value))}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <label style={labelStyle}>Step</label>
        <input
          type="number"
          style={inputStyle}
          value={dt || ""}
          step={0.001}
          min={0}
          placeholder="auto"
          onChange={(e) => {
            const val = e.target.value;
            onDtChange(val === "" ? 0 : parseFloat(val));
          }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <label style={labelStyle}>Solver</label>
        <select
          style={selectStyle}
          value={solver}
          onChange={(e) => onSolverChange(e.target.value)}
        >
          <option value="auto">auto</option>
          <option value="bdf">bdf</option>
          <option value="rk-like">rk-like</option>
        </select>
      </div>
    </div>
  );
}
