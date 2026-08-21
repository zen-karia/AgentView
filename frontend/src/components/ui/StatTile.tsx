import type { ReactNode } from "react";

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** Signed delta text, e.g. "−73%". `deltaGood` picks the colour. */
  delta?: ReactNode;
  deltaGood?: boolean;
  foot?: ReactNode;
}

export function StatTile({ label, value, unit, delta, deltaGood, foot }: StatTileProps) {
  return (
    <div className="ui-stat">
      <span className="ui-stat__label">{label}</span>
      <span className="ui-stat__value tnum">
        {value}
        {unit && <span className="ui-stat__unit">{unit}</span>}
      </span>
      {delta != null && (
        <span
          className={`ui-stat__delta ${
            deltaGood ? "ui-stat__delta--good" : "ui-stat__delta--bad"
          }`}
        >
          {delta}
        </span>
      )}
      {foot && <span className="ui-stat__foot">{foot}</span>}
    </div>
  );
}
