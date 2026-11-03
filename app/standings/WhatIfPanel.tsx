"use client";

import { useMemo, useState } from "react";

export type Scenario = {
  gameWeek: number;
  winnerId: number;
  loserId: number;
  outcomePct: number;
  managerId: number;
  playoff: number;
  bye: number;
};
export type Base = Record<number, { playoff: number; bye: number }>;

const fmt = (n: number) => (n > 0 && n < 1 ? "<1%" : n > 99 && n < 100 ? ">99%" : `${Math.round(n)}%`);
const delta = (d: number) => `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`;

export default function WhatIfPanel({
  scenarios,
  base,
  names,
}: {
  scenarios: Scenario[];
  base: Base;
  names: Record<number, string>;
}) {
  const [open, setOpen] = useState<string | null>(null); // "winner-loser"

  const games = useMemo(() => {
    const seen = new Map<string, { a: number; b: number }>();
    scenarios.forEach((s) => {
      const key = [s.winnerId, s.loserId].sort((x, y) => x - y).join("-");
      if (!seen.has(key)) seen.set(key, { a: Math.min(s.winnerId, s.loserId), b: Math.max(s.winnerId, s.loserId) });
    });
    return Array.from(seen.values());
  }, [scenarios]);
  const week = scenarios[0]?.gameWeek;

  const outcome = (w: number, l: number) => scenarios.filter((s) => s.winnerId === w && s.loserId === l);

  return (
    <div className="mt-8 bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
      <div className="px-4 py-2.5 bg-coffee text-cream flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wide">What If? &middot; Week {week}</span>
        <span className="font-mono text-[10px] text-cream/70">Tap a result to see who it helps</span>
      </div>
      <div className="divide-y divide-biscuit/60">
        {games.map((g) => {
          const outs = [
            { w: g.a, l: g.b },
            { w: g.b, l: g.a },
          ];
          return (
            <div key={`${g.a}-${g.b}`} className="px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {outs.map((o) => {
                  const rows = outcome(o.w, o.l);
                  const key = `${o.w}-${o.l}`;
                  const active = open === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setOpen(active ? null : key)}
                      className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                        active
                          ? "bg-goldenrod text-coffee border-goldenrod"
                          : "bg-transparent text-gravy border-biscuit hover:border-goldenrod"
                      }`}
                    >
                      {names[o.w]} beats {names[o.l]} ({Math.round(rows[0]?.outcomePct ?? 0)}%)
                    </button>
                  );
                })}
              </div>
              {outs.map((o) => {
                const key = `${o.w}-${o.l}`;
                if (open !== key) return null;
                const movers = outcome(o.w, o.l)
                  .map((r) => ({
                    ...r,
                    dp: r.playoff - (base[r.managerId]?.playoff ?? 0),
                    db: r.bye - (base[r.managerId]?.bye ?? 0),
                  }))
                  .filter(
                    (r) =>
                      r.managerId === o.w ||
                      r.managerId === o.l ||
                      Math.abs(r.dp) >= 1 ||
                      Math.abs(r.db) >= 1.5
                  )
                  .sort((x, y) => {
                    const px = x.managerId === o.w || x.managerId === o.l ? 1 : 0;
                    const py = y.managerId === o.w || y.managerId === o.l ? 1 : 0;
                    return py - px || Math.max(Math.abs(y.dp), Math.abs(y.db)) - Math.max(Math.abs(x.dp), Math.abs(x.db));
                  });
                return (
                  <div key={key} className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-gravy/60 uppercase text-[10px]">
                          <th className="text-left py-1 pr-3 font-semibold">Team</th>
                          <th className="text-center py-1 px-2 font-semibold">Playoff</th>
                          <th className="text-center py-1 px-2 font-semibold">Bye</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movers.map((r) => (
                          <tr key={r.managerId} className="border-t border-biscuit/40">
                            <td className="py-1 pr-3 font-semibold text-coffee whitespace-nowrap">
                              {names[r.managerId]}
                              {r.managerId === o.w && <span className="ml-1 text-green-700">W</span>}
                              {r.managerId === o.l && <span className="ml-1 text-burnt">L</span>}
                            </td>
                            <td className="py-1 px-2 text-center whitespace-nowrap">
                              {fmt(base[r.managerId]?.playoff ?? 0)} &rarr; <b>{fmt(r.playoff)}</b>{" "}
                              <span className={r.dp >= 0 ? "text-green-700" : "text-burnt"}>({delta(r.dp)})</span>
                            </td>
                            <td className="py-1 px-2 text-center whitespace-nowrap">
                              {fmt(base[r.managerId]?.bye ?? 0)} &rarr; <b>{fmt(r.bye)}</b>{" "}
                              <span className={r.db >= 0 ? "text-green-700" : "text-burnt"}>({delta(r.db)})</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="text-center font-mono text-[10px] text-gravy/50 py-2 bg-biscuit/20">
        Only teams moving 1+ point (playoff) or 1.5+ points (bye) are listed. Bye odds are the least certain.
      </p>
    </div>
  );
}
