"use client";

import { useMemo, useState } from "react";
import type { Trade, ManagerOption } from "./page";

export default function TradesList({
  trades,
  years,
  managers,
}: {
  trades: Trade[];
  years: number[];
  managers: ManagerOption[];
}) {
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<number | "all">("all");

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (yearFilter !== "all" && t.year !== yearFilter) return false;
      if (ownerFilter !== "all" && !t.sides.some((s) => s.managerId === ownerFilter)) return false;
      return true;
    });
  }, [trades, yearFilter, ownerFilter]);

  return (
    <div>
      <div className="mb-3">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Year</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <FilterChip active={yearFilter === "all"} onClick={() => setYearFilter("all")}>
            All
          </FilterChip>
          {years.map((y) => (
            <FilterChip key={y} active={yearFilter === y} onClick={() => setYearFilter(y)}>
              {y}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Owner</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <FilterChip active={ownerFilter === "all"} onClick={() => setOwnerFilter("all")}>
            All
          </FilterChip>
          {managers.map((m) => (
            <FilterChip key={m.id} active={ownerFilter === m.id} onClick={() => setOwnerFilter(m.id)}>
              {m.name}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 && <p className="text-center font-body text-gravy/60">No trades match those filters.</p>}

      <div className="space-y-6">
        {filtered.map((trade) => (
          <div
            key={trade.tradeNumber}
            className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-coffee text-cream flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wide">Trade #{trade.tradeNumber}</span>
              <span className="font-mono text-xs text-cream/70">{trade.date}</span>
            </div>
            <div
              className={`grid ${trade.sides.length === 2 ? "sm:grid-cols-2" : ""} divide-y sm:divide-y-0 sm:divide-x divide-biscuit/60`}
            >
              {trade.sides.map((side) => (
                <div key={side.managerId} className="px-4 py-3">
                  <p className="font-display text-lg text-gravy mb-2">{side.managerName} receives</p>
                  <ul className="space-y-1">
                    {side.assets.map((a, i) => (
                      <li key={i} className="text-sm text-coffee font-body">
                        {a.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
        active ? "bg-goldenrod text-coffee border-goldenrod" : "bg-transparent text-gravy border-biscuit hover:border-goldenrod"
      }`}
    >
      {children}
    </button>
  );
}
