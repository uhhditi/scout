"use client";

import { useState } from "react";
import { type ChecklistSection } from "@/lib/gearRecommender";



export function GearChecklist({ sections }: { sections: ChecklistSection[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sections.map((s) => s.category)));

  const totalItems = sections.reduce((n, s) => n + s.items.length, 0);
  const checkedCount = checked.size;

  function toggleItem(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSection(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function toggleAllInSection(section: ChecklistSection) {
    const ids = section.items.map((i) => i.id);
    const allChecked = ids.every((id) => checked.has(id));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  return (
    <div className="mt-10 border-t border-[#e5e7eb] pt-10">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#1a1c1e] sm:text-3xl">
            Gear Checklist
          </h2>
          <p className="mt-1 text-sm text-[#888780]">
            Personalized based on your trip profile and forecast conditions.
          </p>
        </div>
        <span className="text-sm font-semibold text-[#6b7078]">
          {checkedCount} / {totalItems} packed
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
        <div
          className="h-2 rounded-full bg-[#ea8a12] transition-all duration-300"
          style={{ width: totalItems > 0 ? `${(checkedCount / totalItems) * 100}%` : "0%" }}
        />
      </div>

      <div className="space-y-4">
        {sections.map((section) => {
          const isOpen = expanded.has(section.category);
          const sectionChecked = section.items.filter((i) => checked.has(i.id)).length;

          const allChecked = section.items.every((i) => checked.has(i.id));

          return (
            <div
              key={section.category}
              className="rounded-2xl border border-[#eadfcd] bg-white shadow-sm"
            >
              <div className="flex w-full items-center gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => toggleSection(section.category)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <span className="font-display text-base font-bold text-[#1a1c1e]">
                    {section.label}
                  </span>
                  <span className="text-xs text-[#888780]">
                    ({sectionChecked}/{section.items.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllInSection(section)}
                  className="shrink-0 text-xs font-semibold text-[#ea8a12] hover:underline underline-offset-2"
                >
                  {allChecked ? "Deselect all" : "Select all"}
                </button>
                <span
                  className="text-[#888780] cursor-pointer"
                  aria-hidden
                  onClick={() => toggleSection(section.category)}
                >
                  {isOpen ? "▲" : "▼"}
                </span>
              </div>

              {isOpen && (
                <ul className="divide-y divide-[#f0ebe2] border-t border-[#eadfcd]">
                  {section.items.map((item) => {
                    const isChecked = checked.has(item.id);
                    return (
                      <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                        <input
                          type="checkbox"
                          id={item.id}
                          checked={isChecked}
                          onChange={() => toggleItem(item.id)}
                          className="h-4 w-4 shrink-0 accent-[#ea8a12]"
                        />
                        <label
                          htmlFor={item.id}
                          className={`flex flex-1 flex-wrap items-center gap-2 text-sm font-medium cursor-pointer ${
                            isChecked ? "line-through text-[#aab0b8]" : "text-[#1a1c1e]"
                          }`}
                        >
                          {item.name}
                        </label>
                        {item.storeLinks.length > 0 && (
                          <a
                            href={item.storeLinks[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-semibold text-[#ea8a12] underline-offset-2 hover:underline"
                          >
                            {item.storeLinks[0].name} ↗
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
