"use client";

type DashboardChartsProps = {
  chartSeed: number;
};

export function DashboardCharts({ chartSeed }: DashboardChartsProps) {
  const tempA = 56 + (chartSeed % 10);
  const tempB = 60 + ((chartSeed * 3) % 11);
  const tempC = 64 + ((chartSeed * 5) % 9);
  const tempD = 61 + ((chartSeed * 7) % 10);
  const tempE = 58 + ((chartSeed * 11) % 8);
  const tempF = 54 + ((chartSeed * 13) % 8);
  const temps = [tempA, tempB, tempC, tempD, tempE, tempF];

  const linePoints = temps
    .map((temp, idx) => {
      const x = idx * 64;
      const y = 120 - (temp - 45) * 2.2;
      return `${x},${Math.max(8, Math.min(112, y))}`;
    })
    .join(" ");

  const fireRisk = Math.min(1, 0.48 + (chartSeed % 45) / 100);
  const airRisk = Math.min(1, 0.44 + ((chartSeed * 3) % 40) / 100);
  const wildlifeRisk = Math.min(1, 0.42 + ((chartSeed * 5) % 45) / 100);

  const R = 58;
  const deg = (d: number) => (d * Math.PI) / 180;
  const v1 = { x: 100, y: 100 - R * fireRisk };
  const v2 = {
    x: 100 + R * airRisk * Math.cos(deg(30)),
    y: 100 + R * airRisk * Math.sin(deg(30)),
  };
  const v3 = {
    x: 100 + R * wildlifeRisk * Math.cos(deg(150)),
    y: 100 + R * wildlifeRisk * Math.sin(deg(150)),
  };
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
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1="0"
                y1={20 + i * 24}
                x2="320"
                y2={20 + i * 24}
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
            {temps.map((temp, idx) => {
              const x = idx * 64;
              const y = 120 - (temp - 45) * 2.2;
              return (
                <circle
                  key={`${temp}-${idx}`}
                  cx={x}
                  cy={Math.max(8, Math.min(112, y))}
                  r="3.5"
                  fill="#ea8a12"
                />
              );
            })}
            {["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"].map((label, idx) => (
              <text
                key={label}
                x={idx * 64}
                y="136"
                textAnchor="middle"
                fill="#6b7078"
                fontSize="11"
                style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
              >
                {label}
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
            <text
              x="100"
              y="22"
              textAnchor="middle"
              fill="#6b7078"
              fontSize="11"
              style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
            >
              Fire
            </text>
            <text
              x="168"
              y="152"
              textAnchor="start"
              fill="#6b7078"
              fontSize="11"
              style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
            >
              Air
            </text>
            <text
              x="32"
              y="152"
              textAnchor="end"
              fill="#6b7078"
              fontSize="11"
              style={{ fontFamily: "Georgia, 'Times New Roman', Times, serif" }}
            >
              Wildlife
            </text>
          </svg>
        </div>
      </article>
    </div>
  );
}
