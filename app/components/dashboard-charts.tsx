"use client";

type DashboardChartsProps = {
  chartSeed: number;
  temps?: number[];
  fireRisk?: number;
  airRisk?: number;
  bearRisk?: number;
};

export function DashboardCharts({ chartSeed, temps, fireRisk, airRisk, bearRisk }: DashboardChartsProps) {
  const hasRealTemps = temps && temps.length > 0;
  const displayTemps = hasRealTemps
    ? temps.slice(0, 7)
    : [
        56 + (chartSeed % 10),
        60 + ((chartSeed * 3) % 11),
        64 + ((chartSeed * 5) % 9),
        61 + ((chartSeed * 7) % 10),
        58 + ((chartSeed * 11) % 8),
        54 + ((chartSeed * 13) % 8),
      ];

  const n = displayTemps.length;
  // Reserve room for y-axis labels and x-axis day labels.
  const chartLeft = 36;
  const chartRight = 306;
  const chartTop = 12;
  const chartBottom = 118;
  const xStep = n > 1 ? (chartRight - chartLeft) / (n - 1) : 0;
  const xFor = (idx: number) => (n === 1 ? (chartLeft + chartRight) / 2 : chartLeft + idx * xStep);

  // Dynamic y scaling based on actual temp range
  const minTemp = Math.min(...displayTemps);
  const maxTemp = Math.max(...displayTemps);
  const tempRange = Math.max(maxTemp - minTemp, 10);
  const yFor = (temp: number) => {
    const normalized = (temp - minTemp) / tempRange;
    return chartBottom - normalized * (chartBottom - chartTop);
  };
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => {
    const t = maxTemp - (i * tempRange) / (yTicks - 1);
    return Math.round(t);
  });
  const yTickY = (i: number) => chartTop + (i * (chartBottom - chartTop)) / (yTicks - 1);

  const linePoints = displayTemps
    .map((temp, idx) => `${xFor(idx)},${yFor(temp)}`)
    .join(" ");

  const hasRealRisk = fireRisk !== undefined && airRisk !== undefined && bearRisk !== undefined;
  const rawFr = hasRealRisk ? fireRisk! : Math.min(100, 48 + (chartSeed % 45));
  const rawAr = hasRealRisk ? airRisk! : Math.min(100, 44 + ((chartSeed * 3) % 40));
  const rawBr = hasRealRisk ? bearRisk! : Math.min(100, 42 + ((chartSeed * 5) % 45));
  const rawRiskValues = [rawFr, rawAr, rawBr];
  const minRisk = Math.min(...rawRiskValues);
  const maxRisk = Math.max(...rawRiskValues);
  const riskRange = Math.max(maxRisk - minRisk, 8);
  // Expand similar ranges so shape changes are easier to see between searches.
  const normalized = (value: number) => 0.2 + 0.8 * ((value - minRisk) / riskRange);
  const fr = normalized(rawFr);
  const ar = normalized(rawAr);
  const br = normalized(rawBr);

  const R = 58;
  const deg = (d: number) => (d * Math.PI) / 180;
  const v1 = { x: 100, y: 100 - R * fr };
  const v2 = { x: 100 + R * ar * Math.cos(deg(30)), y: 100 + R * ar * Math.sin(deg(30)) };
  const v3 = { x: 100 + R * br * Math.cos(deg(150)), y: 100 + R * br * Math.sin(deg(150)) };
  const poly = `${v1.x},${v1.y} ${v2.x},${v2.y} ${v3.x},${v3.y}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg font-bold text-[#1a1c1e]">Temperature Over Time</h3>
        <p className="font-display mt-1 text-sm text-[#5f646b]">
          Expected daily temperature trend across your trip window
        </p>
        <div className="mt-4 h-[200px] w-full rounded-xl bg-white p-4">
          <svg viewBox="0 0 320 140" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ea8a12" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#ea8a12" />
              </linearGradient>
            </defs>
            {Array.from({ length: yTicks }).map((_, i) => (
              <line
                key={i}
                x1={chartLeft}
                y1={yTickY(i)}
                x2={chartRight}
                y2={yTickY(i)}
                stroke="#d1d5db"
                strokeWidth="1"
              />
            ))}
            <polyline
              points={linePoints}
              fill="none"
              stroke="url(#chartLine)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {displayTemps.map((temp, idx) => (
              <circle key={idx} cx={xFor(idx)} cy={yFor(temp)} r="3.5" fill="#ea8a12" />
            ))}
            {displayTemps.map((temp, idx) => (
              <text
                key={idx}
                x={xFor(idx)}
                y="136"
                textAnchor={idx === 0 ? "start" : idx === n - 1 ? "end" : "middle"}
                fill="#6b7078"
                fontSize="11"
                style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
              >
                {`Day ${idx + 1}`}
              </text>
            ))}
            {yTickValues.map((temp, i) => (
              <text
                key={`y-${i}`}
                x={chartLeft - 6}
                y={yTickY(i) + 3}
                textAnchor="end"
                fill="#6b7078"
                fontSize="10"
                style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
              >
                {`${temp}°`}
              </text>
            ))}
          </svg>
        </div>
      </article>

      <article className="rounded-2xl border border-[#eadfcd] bg-white p-5 shadow-sm">
        <h3 className="font-display text-lg font-bold text-[#1a1c1e]">Risk Matrix</h3>
        <p className="font-display mt-1 text-sm text-[#5f646b]">
          Current composite risk across fire, air, and wildlife factors
        </p>
        <div className="mt-4 flex h-[200px] items-center justify-center">
          <svg viewBox="0 0 200 200" className="h-full max-h-[180px] w-full max-w-[180px]">
            <g stroke="#d1d5db" strokeWidth="1" fill="none">
              {[20, 40, 60, 80].map((r) => (
                <polygon
                  key={r}
                  points={`100,${100 - r} ${100 + r * 0.866},${100 + r * 0.5} ${100 - r * 0.866},${100 + r * 0.5}`}
                  opacity={0.6}
                />
              ))}
              <line x1="100" y1="100" x2="100" y2="30" />
              <line x1="100" y1="100" x2="160.6" y2="135" />
              <line x1="100" y1="100" x2="39.4" y2="135" />
            </g>
            <polygon
              points={poly}
              fill="rgba(234, 138, 18, 0.16)"
              stroke="#ea8a12"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <text x="100" y="22" textAnchor="middle" fill="#6b7078" fontSize="11" style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}>
              Fire
            </text>
            <text x="100" y="34" textAnchor="middle" fill="#9aa0a8" fontSize="10" style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}>
              {Math.round(rawFr)}
            </text>
            <text x="168" y="152" textAnchor="start" fill="#6b7078" fontSize="11" style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}>
              Air
            </text>
            <text x="168" y="164" textAnchor="start" fill="#9aa0a8" fontSize="10" style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}>
              {Math.round(rawAr)}
            </text>
            <text x="32" y="152" textAnchor="end" fill="#6b7078" fontSize="11" style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}>
              Bear
            </text>
            <text x="32" y="164" textAnchor="end" fill="#9aa0a8" fontSize="10" style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}>
              {Math.round(rawBr)}
            </text>
          </svg>
        </div>
      </article>
    </div>
  );
}
