"use client";

import { FormEvent, useState } from "react";
import { getSafetyReport, type SafetyReport } from "@/lib/safetyReport";

function formatRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

const detailTextByMetric: Record<string, string[]> = {
  "Fire Risk": [
    "Wind and dry-fuel conditions suggest carrying a backup suppression tool and avoiding open flames after dusk.",
    "Check county burn restrictions before arrival and keep your campfire fully contained to designated rings.",
  ],
  "Air Quality": [
    "AQI shifts quickly with regional smoke movement, so monitor updates throughout the day.",
    "If anyone in your group has respiratory sensitivity, keep masks and low-exertion backup plans ready.",
  ],
  "Water Access": [
    "Nearest refill reliability can vary by season, so verify streams and taps before setting out.",
    "Carry filtration and a reserve supply in case natural sources are low or temporarily inaccessible.",
  ],
  "Weather Alertness": [
    "Mountain weather can change within hours, especially late afternoon and overnight.",
    "Plan layers, rain protection, and a quick shelter strategy before reaching remote sections.",
  ],
};

function metricSectionId(label: string) {
  return `metric-section-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

export default function Home() {
  const [siteType, setSiteType] = useState<"campsite" | "trail">("campsite");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [trailDistance, setTrailDistance] = useState("");
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<Record<string, boolean>>(
    {},
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedStartDate =
      siteType === "campsite" ? startDate : new Date().toISOString().slice(0, 10);
    const normalizedEndDate =
      siteType === "campsite" ? endDate : normalizedStartDate;
    const querySeed =
      siteType === "trail"
        ? `${address} | distance:${trailDistance}`
        : address;

    const nextReport = await getSafetyReport(
      querySeed,
      normalizedStartDate,
      normalizedEndDate,
    );
    setReport(nextReport);
    setExpandedMetric({});
  };

  const openMetricDetails = (label: string) => {
    let shouldScroll = false;
    setExpandedMetric((previous) => {
      const nextValue = !previous[label];
      shouldScroll = nextValue;
      return {
        ...previous,
        [label]: nextValue,
      };
    });

    if (shouldScroll) {
      requestAnimationFrame(() => {
        const section = document.getElementById(metricSectionId(label));
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#1a1c1e] px-4 py-5 text-[#F5ECD7]">
      <section className="mx-auto w-full px-4 md:px-8 lg:px-12">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⛺️</span>
            <p className="font-display text-2xl font-bold text-[#F5ECD7]">Scout</p>
          </div>
        </header>

        <div>
          <div className="max-w-md">
            <h1 className="font-display text-5xl leading-[1.05] font-bold text-[#F5ECD7]">
              Camp With Ease, Scout Your Site.
            </h1>
            <p className="mt-3 text-lg text-[#888780]">
              Real-time fire risk, air quality, and water access data for your
              next wilderness adventure.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-5 w-full rounded-3xl border border-[#2f3237] bg-[#22252a] p-3.5 shadow-sm"
          >
            <div className="mb-2.5">
              <p className="text-sm font-semibold tracking-[0.12em] text-[#EF9F27] uppercase">
                Site Lookup
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex w-fit rounded-xl border border-[#363a40] bg-[#1a1c1e] p-1">
                <button
                  type="button"
                  onClick={() => setSiteType("campsite")}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    siteType === "campsite"
                      ? "bg-[#EF9F27] text-[#1a1c1e]"
                      : "text-[#888780] hover:text-[#F5ECD7]"
                  }`}
                >
                  Campsite
                </button>
                <button
                  type="button"
                  onClick={() => setSiteType("trail")}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    siteType === "trail"
                      ? "bg-[#EF9F27] text-[#1a1c1e]"
                      : "text-[#888780] hover:text-[#F5ECD7]"
                  }`}
                >
                  Trail
                </button>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[#F5ECD7]">
                  Campsite / Trail Address
                </span>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="ex: Yosemite Valley Campground, CA"
                  className="w-full rounded-xl border border-[#363a40] bg-[#1a1c1e] px-4 py-2.5 text-[#F5ECD7] outline-none placeholder:text-[#888780] focus:border-[#EF9F27]"
                />
              </label>

              {siteType === "campsite" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="w-full rounded-xl border border-[#363a40] bg-[#1a1c1e] px-4 py-2.5 text-[#F5ECD7] outline-none focus:border-[#EF9F27]"
                  />
                  <input
                    type="date"
                    required
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className="w-full rounded-xl border border-[#363a40] bg-[#1a1c1e] px-4 py-2.5 text-[#F5ECD7] outline-none focus:border-[#EF9F27]"
                  />
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-[#F5ECD7]">
                    Trail Distance (miles)
                  </span>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    value={trailDistance}
                    onChange={(event) => setTrailDistance(event.target.value)}
                    placeholder="ex: 8.5"
                    className="w-full rounded-xl border border-[#363a40] bg-[#1a1c1e] px-4 py-2.5 text-[#F5ECD7] outline-none placeholder:text-[#888780] focus:border-[#EF9F27]"
                  />
                </label>
              )}

              <button
                type="submit"
                className="w-full rounded-xl border border-[#EF9F27] bg-[#EF9F27] py-2 font-medium text-[#1a1c1e] transition hover:brightness-110"
              >
                Scout
              </button>
            </div>
          </form>
        </div>

        {report && (
          <section className="mt-7">
            <h2 className="font-display text-4xl font-bold">{address}</h2>
            <p className="mt-2 text-[#888780]">
              {siteType === "campsite"
                ? `Conditions forecast for ${formatRange(startDate, endDate)}`
                : `Trail distance planned: ${trailDistance} miles`}
            </p>

            <div className="mt-4 grid gap-3.5">
              <article className="rounded-3xl border border-[#2f3237] bg-[#22252a] p-4 shadow-sm">
                <p className="font-display text-center text-lg font-semibold">Overall Safety Score</p>
                <p className="font-display mt-2 text-center text-5xl font-bold text-[#F5ECD7]">
                  {report.overallScore}
                </p>
                <p className="text-center text-sm text-[#888780]">/ 100</p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#1a1c1e]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#C0392B] via-[#EF9F27] to-[#F5ECD7]"
                    style={{ width: `${report.overallScore}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[#888780]">{report.status}</p>
              </article>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {report.metrics.slice(0, 4).map((metric) => {
                  const radius = 28;
                  const circumference = 2 * Math.PI * radius;
                  const dashOffset = circumference * (1 - metric.value / 100);
                  const progressColor =
                    metric.label === "Fire Risk" ? "#C0392B" : "#EF9F27";

                  return (
                    <article
                      key={metric.label}
                      className="rounded-3xl border border-[#2f3237] bg-[#22252a] p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-[#888780]">
                          {metric.icon} {metric.label}
                        </p>
                        <button
                          type="button"
                          onClick={() => openMetricDetails(metric.label)}
                          className="relative h-16 w-16 shrink-0 transition hover:scale-105"
                          aria-label={`View ${metric.label} details`}
                        >
                          <svg viewBox="0 0 72 72" className="h-16 w-16 -rotate-90">
                            <circle
                              cx="36"
                              cy="36"
                              r={radius}
                              stroke="#1a1c1e"
                              strokeWidth="8"
                              fill="none"
                            />
                            <circle
                              cx="36"
                              cy="36"
                              r={radius}
                              stroke={progressColor}
                              strokeWidth="8"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={dashOffset}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#F5ECD7]">
                            {metric.value}
                          </span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="space-y-2">
                {report.metrics.slice(0, 4).map((metric) => {
                  const isExpanded = Boolean(expandedMetric[metric.label]);
                  const details = detailTextByMetric[metric.label] ?? [];

                  return (
                    <article
                      id={metricSectionId(metric.label)}
                      key={`${metric.label}-details`}
                      className="rounded-2xl border border-[#2f3237] bg-[#22252a] shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMetric((previous) => ({
                            ...previous,
                            [metric.label]: !previous[metric.label],
                          }))
                        }
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="text-sm font-medium text-[#F5ECD7]">
                          {metric.icon} {metric.label}
                        </span>
                        <span className="text-xs font-semibold tracking-wide text-[#EF9F27] uppercase">
                          Details
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-[#2f3237] px-4 py-3 text-sm text-[#888780]">
                          <p>{metric.note}</p>
                          <div className="mt-2 space-y-2">
                            {details.map((detail) => (
                              <p key={detail}>{detail}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
