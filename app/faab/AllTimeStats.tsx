"use client";

import { Fragment, useMemo, useState } from "react";

type Claim = {
  id: number;
  year: number;
  player_name: string;
  nfl_team: string;
  position: string;
  winning_bid: number;
  manager_id: number;
  manager_name: string;
};

type Offer = { manager_name: string; amount: number; reason: string };

type Era = "all" | "10" | "12";

const TEN_TEAM_YEARS = new Set([2016, 2017, 2018]);

function matchesEra(year: number, era: Era) {
  if (era === "all") return true;
  const isTen = TEN_TEAM_YEARS.has(year);
  return era === "10" ? isTen : !isTen;
}

function matchesPosition(position: string, filter: string) {
  if (filter === "all") return true;
  return position?.split(",").includes(filter);
}

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Anomaly cutoff via the standard IQR rule: anything above Q3 + 1.5*IQR is
// excluded from the "average" (but still counted in the total).
function iqrUpperBound(values: number[]): number {
  if (values.length < 4) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  return q3 + 1.5 * (q3 - q1);
}

export default function AllTimeStats({
  allClaims,
  offersByClaimId,
}: {
  allClaims: Claim[];
  offersByClaimId: Record<number, Offer[]>;
}) {
  const [era, setEra] = useState<Era>("12");
  const [bidPosition, setBidPosition] = useState<string>("all");
  const [bidManager, setBidManager] = useState<string>("all");
  const [openManager, setOpenManager] = useState<string | null>(null);
  const [openTopBidId, setOpenTopBidId] = useState<number | null>(null);
  const [openOverspendManager, setOpenOverspendManager] = useState<string | null>(null);

  const managers = useMemo(() => {
    const names = Array.from(new Set(allClaims.map((c) => c.manager_name)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [allClaims]);

  const eraClaims = useMemo(() => allClaims.filter((c) => matchesEra(c.year, era)), [allClaims, era]);

  const careerTotals = useMemo(() => {
    const byManager = new Map<string, { total: number; count: number }>();
    eraClaims.forEach((c) => {
      const cur = byManager.get(c.manager_name) ?? { total: 0, count: 0 };
      cur.total += c.winning_bid;
      cur.count += 1;
      byManager.set(c.manager_name, cur);
    });
    return Array.from(byManager.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [eraClaims]);

  const careerClaimsByManager = useMemo(() => {
    if (!openManager) return [];
    return eraClaims
      .filter((c) => c.manager_name === openManager)
      .sort((a, b) => b.winning_bid - a.winning_bid);
  }, [eraClaims, openManager]);

  const topBids = useMemo(() => {
    return eraClaims
      .filter((c) => matchesPosition(c.position, bidPosition) && (bidManager === "all" || c.manager_name === bidManager))
      .sort((a, b) => b.winning_bid - a.winning_bid)
      .slice(0, 5);
  }, [eraClaims, bidPosition, bidManager]);

  // For each claim, the "next bid" skips any offer from the same manager who
  // won (duplicate/corrected claims by the winner shouldn't count as competition).
  const overspendClaims = useMemo(() => {
    return eraClaims
      .map((c) => {
        const offers = offersByClaimId[c.id] ?? [];
        const nextOffer = offers.find((o) => o.manager_name !== c.manager_name);
        if (!nextOffer) return null;
        return {
          ...c,
          nextOfferAmount: nextOffer.amount,
          nextOfferManager: nextOffer.manager_name,
          overspend: c.winning_bid - nextOffer.amount,
        };
      })
      .filter(
        (c): c is Claim & { nextOfferAmount: number; nextOfferManager: string; overspend: number } => c !== null
      );
  }, [eraClaims, offersByClaimId]);

  const overspendByManager = useMemo(() => {
    const byManager = new Map<string, { values: number[]; claims: typeof overspendClaims }>();
    overspendClaims.forEach((c) => {
      const cur = byManager.get(c.manager_name) ?? { values: [], claims: [] };
      cur.values.push(c.overspend);
      cur.claims.push(c);
      byManager.set(c.manager_name, cur);
    });

    return Array.from(byManager.entries())
      .map(([name, { values, claims }]) => {
        const total = values.reduce((s, v) => s + v, 0);
        const upperBound = iqrUpperBound(values);
        const trimmed = values.filter((v) => v <= upperBound);
        const avgTrimmed = trimmed.length > 0 ? trimmed.reduce((s, v) => s + v, 0) / trimmed.length : 0;
        return {
          name,
          total,
          count: values.length,
          avgTrimmed,
          excludedCount: values.length - trimmed.length,
          claims: claims.slice().sort((a, b) => b.overspend - a.overspend),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [overspendClaims]);

  return (
    <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
      <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center mb-8">
        <span className="font-display text-lg text-gravy mr-2">ERA</span>
        {[
          { key: "12" as Era, label: "12-Team (2019\u201325)" },
          { key: "all" as Era, label: "All-Time" },
          { key: "10" as Era, label: "10-Team (2016\u201318)" },
        ].map((e) => (
          <button
            key={e.key}
            onClick={() => setEra(e.key)}
            className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
              era === e.key ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="text-center mb-8">
        <h2 className="font-display text-4xl text-gravy chalk-shadow">ALL-TIME RECORDS</h2>
        <div className="menu-divider w-40 mx-auto mt-3" />
      </div>

      {/* Career FAAB totals */}
      <div className="mb-12">
        <h3 className="font-display text-2xl text-gravy text-center mb-4">Career FAAB Spent</h3>
        <p className="text-center font-mono text-[10px] text-gravy/50 mb-4">Click a manager to see every claim</p>
        <div className="max-w-4xl mx-auto space-y-2">
          {careerTotals.map((s) => {
            const isOpen = openManager === s.name;
            return (
              <div key={s.name}>
                <button
                  onClick={() => setOpenManager(isOpen ? null : s.name)}
                  className="w-full bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex items-center justify-between hover:bg-biscuit/20 transition-colors"
                >
                  <span className="font-semibold text-coffee">
                    {s.name}
                    <span className="ml-2 text-gravy/40 font-mono text-xs">{isOpen ? "\u25b2" : "\u25bc"}</span>
                  </span>
                  <span className="font-mono text-sm text-right">
                    <span className="font-bold text-burnt">${s.total}</span>
                    <span className="text-gravy/50 ml-1.5">/ {s.count}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="bg-cream/60 border-2 border-t-0 border-coffee rounded-b-lg -mt-1 px-4 py-3">
                    <div className="space-y-1">
                      {careerClaimsByManager.map((c) => (
                        <div
                          key={c.id}
                          className="grid grid-cols-[1fr_60px_50px] items-center gap-2 px-3 py-1.5 rounded font-mono text-xs bg-plate border border-biscuit"
                        >
                          <span className="text-coffee font-semibold">
                            {c.player_name} <span className="text-gravy/40">({c.position})</span>
                          </span>
                          <span className="text-burnt font-bold text-center">${c.winning_bid}</span>
                          <span className="text-gravy/50 text-right">{c.year}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 5 highest bids */}
      <div className="mb-12">
        <h3 className="font-display text-2xl text-gravy text-center mb-4">Top 5 Highest Bids</h3>
        <div className="flex flex-wrap items-center gap-3 justify-center mb-4">
          <select
            value={bidPosition}
            onChange={(e) => setBidPosition(e.target.value)}
            className="px-3 py-1.5 rounded font-mono text-xs font-semibold border-2 border-biscuit bg-plate text-gravy"
          >
            <option value="all">All Positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={bidManager}
            onChange={(e) => setBidManager(e.target.value)}
            className="px-3 py-1.5 rounded font-mono text-xs font-semibold border-2 border-biscuit bg-plate text-gravy"
          >
            <option value="all">All Managers</option>
            {managers.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        {topBids.length === 0 ? (
          <p className="text-center font-body text-gravy/60 max-w-3xl mx-auto">No bids match these filters.</p>
        ) : (
          <div className="max-w-3xl mx-auto bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/20">
                  <th className="text-left py-2 px-3 font-semibold">Player</th>
                  <th className="text-left py-2 px-3 font-semibold">Manager</th>
                  <th className="text-left py-2 px-3 font-semibold">Year</th>
                  <th className="text-right py-2 px-3 font-semibold">Bid</th>
                </tr>
              </thead>
              <tbody>
                {topBids.map((c) => {
                  const offers = offersByClaimId[c.id] ?? [];
                  const isOpen = openTopBidId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => setOpenTopBidId(isOpen ? null : c.id)}
                        className="border-b border-biscuit/60 last:border-0 cursor-pointer hover:bg-biscuit/20 transition-colors"
                      >
                        <td className="py-2 px-3 font-semibold text-coffee">
                          {c.player_name} <span className="text-gravy/40 font-mono text-xs">({c.position})</span>
                          {offers.length > 0 && (
                            <span className="ml-2 text-gravy/40 font-mono text-xs">{isOpen ? "\u25b2" : "\u25bc"}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono text-gravy/80">{c.manager_name}</td>
                        <td className="py-2 px-3 font-mono text-gravy/80">{c.year}</td>
                        <td className="py-2 px-3 font-mono font-bold text-burnt text-right">${c.winning_bid}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-cream/60">
                          <td colSpan={4} className="px-4 py-3">
                            {offers.length === 0 ? (
                              <p className="font-mono text-xs text-gravy/50">No competing offers &mdash; uncontested claim.</p>
                            ) : (
                              <div className="space-y-1">
                                {offers.map((o, i) => (
                                  <div
                                    key={i}
                                    className="grid grid-cols-[1fr_60px_1fr] items-center gap-2 px-3 py-1.5 rounded font-mono text-xs bg-plate border border-biscuit"
                                  >
                                    <span className="text-coffee font-semibold">{o.manager_name}</span>
                                    <span className="text-burnt font-bold text-center">${o.amount}</span>
                                    <span className="text-gravy/50 text-right">{o.reason}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overspend above next bid */}
      <div className="mb-4">
        <h3 className="font-display text-2xl text-gravy text-center mb-2">Overspend Above Next Bid</h3>
        <p className="text-center font-mono text-[10px] text-gravy/50 mb-4 max-w-lg mx-auto">
          Winning bid minus the highest offer from a <em>different</em> manager &mdash; same-manager duplicate offers
          don&apos;t count as competition. Average excludes extreme outliers (IQR method). Click a manager to see every claim.
        </p>
        {overspendByManager.length === 0 ? (
          <p className="text-center font-body text-gravy/60 max-w-3xl mx-auto">No contested claims for this era.</p>
        ) : (
          <div className="max-w-4xl mx-auto space-y-2">
            {overspendByManager.map((m) => {
              const isOpen = openOverspendManager === m.name;
              return (
                <div key={m.name}>
                  <button
                    onClick={() => setOpenOverspendManager(isOpen ? null : m.name)}
                    className="w-full bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex items-center justify-between hover:bg-biscuit/20 transition-colors"
                  >
                    <span className="font-semibold text-coffee">
                      {m.name}
                      <span className="ml-2 text-gravy/40 font-mono text-xs">{isOpen ? "\u25b2" : "\u25bc"}</span>
                    </span>
                    <span className="font-mono text-sm text-right">
                      <span className="font-bold text-burnt">+${m.total}</span>
                      <span className="text-gravy/50 ml-1.5">total &middot; +${m.avgTrimmed.toFixed(1)} avg</span>
                      <span className="text-gravy/40 ml-1.5">/ {m.count}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="bg-cream/60 border-2 border-t-0 border-coffee rounded-b-lg -mt-1 px-4 py-3">
                      {m.excludedCount > 0 && (
                        <p className="font-mono text-[10px] text-gravy/50 mb-2">
                          {m.excludedCount} outlier claim{m.excludedCount > 1 ? "s" : ""} excluded from the average above
                        </p>
                      )}
                      <div className="space-y-1">
                        {m.claims.map((c) => (
                          <div
                            key={c.id}
                            className="grid grid-cols-[1fr_140px_50px] items-center gap-2 px-3 py-1.5 rounded font-mono text-xs bg-plate border border-biscuit"
                          >
                            <span className="text-coffee font-semibold">
                              {c.player_name} <span className="text-gravy/40">({c.position})</span>
                            </span>
                            <span className="text-burnt font-bold text-center">
                              +${c.overspend}{" "}
                              <span className="text-gravy/40">(${c.winning_bid} vs ${c.nextOfferAmount})</span>
                            </span>
                            <span className="text-gravy/50 text-right">{c.year}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
