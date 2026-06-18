"use client";

import { useState } from "react";

export type ParsedTrip = {
  location: string;
  startDate: string;
  endDate: string;
  companions: string[];
  healthConcerns: string[];
  complete: boolean;
  rawDescription?: string;
};

export function TripPlannerPanel({
  onBack,
  onParsed,
}: {
  onBack: () => void;
  onParsed: (parsed: ParsedTrip) => void;
}) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [quotaHit, setQuotaHit] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim() || loading) return;
    setLoading(true);
    setErrorMsg("");
    setQuotaHit(false);

    try {
      const res = await fetch("/api/trip-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json() as { error?: string; location?: string; startDate?: string; endDate?: string; companions?: string[]; healthConcerns?: string[]; complete?: boolean };

      if (res.status === 429) {
        setQuotaHit(true);
        setErrorMsg("AI is temporarily unavailable — daily limit reached. Fill in your trip details manually instead.");
        return;
      }

      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "Something went wrong. Try again.");
        return;
      }

      onParsed({
        location: data.location ?? "",
        startDate: data.startDate ?? "",
        endDate: data.endDate ?? "",
        companions: data.companions ?? [],
        healthConcerns: data.healthConcerns ?? [],
        complete: data.complete ?? false,
        rawDescription: description,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-6 text-left font-display">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-bold text-[#888780] transition hover:text-[#1a1c1e]"
        >
          ← Back
        </button>
        <p className="text-[clamp(1.15rem,3.5vw,1.85rem)] font-bold text-[#3d4249]">
          Describe your trip
        </p>
      </div>

      <textarea
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={loading}
        placeholder='e.g. "We want to camp near Seattle in August with our 8-year-old and golden retriever. My husband has mild asthma."'
        className="w-full resize-none rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/70 px-5 py-4 text-lg text-[#1a1c1e] outline-none placeholder:text-[#9aa0a8] focus:border-[#d97706]/60 focus:ring-4 focus:ring-[#f7d6ab]/50 disabled:opacity-60"
      />

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
          {quotaHit && (
            <button
              type="button"
              onClick={onBack}
              className="mt-2 block font-semibold underline underline-offset-2"
            >
              Fill in manually →
            </button>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!description.trim() || loading}
          onClick={() => void handleSubmit()}
          className="rounded-full bg-[#ea8a12] px-12 py-4 text-base font-extrabold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? "Understanding your trip…" : "Plan my trip →"}
        </button>
      </div>
    </div>
  );
}
