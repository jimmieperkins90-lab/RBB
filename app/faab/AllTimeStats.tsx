"use client";

import { useMemo, useState } from "react";

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

type ValuePickup = {
  id: number;
  year: number;
  player_name: string;
  position: string;
  manager_name: string;
  winning_bid: number;
  points: number;
  ppd: number;
};

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

export default function AllTimeStats({
  allClaims,
  maxOfferByClaimId,
  valuePickups,
}: {
  allClaims: Claim[];
  maxOfferByClaimId: Record<number, number>;
  valuePickups: ValuePickup[];
}) {
  const [era, setEra] = useState<Era>("all");
  const [bidPosition, setBidPosition] = useState<string>("all");
  const [bidManager, setBidManager] = useState<string>("all");

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

  const topBids = useMemo(() => {
    return eraClaims
      .filter((c) => matchesPosition(c.position, bidPosition) && (bidManager === "all" || c.manager_name === bidManager))
      .sort((a, b) => b.winning_bid - a.winning_bid)
      .slice(0, 5);
  }, [eraClaims, bidPosition, bidManager]);

  const tightestWars = useMemo(() => {
    return eraClaims
      .map((c) => {
        const maxOffer = maxOfferByClaimId[c.id];
        if (maxOffer === undefined) return null;
        return { ...c, maxOffer, gap: c.winning_bid - maxOffer };
      })
      .filter((c): c is Claim & { maxOffer: number; gap: number } => c !== null)
      .sort((a, b) => a.gap - b.gap || b.winning_bid - a.winning_bid)
      .slice(0, 5);
  }, [eraClaims, maxOfferByClaimId]);

  const bestValue = useMemo(() => {
    return valuePickups
      .filter((v) => matchesEra(v.year, era) && v.winning_bid > 0)
      .sort((a, b) => b.ppd - a.ppd)
      .slice(0, 5);
  }, [valuePickups, era]);

  return (
    <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
      <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center mb-8">
        <span className="font-display text-lg text-gravy mr-2">ERA</span>
        {[
          { key: "all" as Era, label: "All-Time" },
          { key: "10" as Era, label: "10-Team (2016\u201318)" },
          { key: "12" as Era, label: "12-Team (2019\u201325)" },
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
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {careerTotals.map((s) => (
            <div
              key={s.name}
              className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex items-center justify-between"
            >
              <span className="font-semibold text-coffee">{s.name}</span>
              <span className="font-mono text-sm text-right">
                <span className="font-bold text-burnt">${s.total}</span>
                <span className="text-gravy/50 ml-1.5">/ {s.count}</span>
              </span>
            </div>
          ))}
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
        <RecordTable
          rows={topBids}
          columns={[
            { label: "Player", render: (c) => `${c.player_name} (${c.position})` },
            { label: "Manager", render: (c) => c.manager_name },
            { label: "Year", render: (c) => String(c.year) },
            { label: "Bid", render: (c) => `$${c.winning_bid}`, alignRight: true },
          ]}
          empty="No bids match these filters."
        />
      </div>

      {/* Tightest bidding wars */}
      <div className="mb-12">
        <h3 className="font-display text-2xl text-gravy text-center mb-4">Tightest Bidding Wars</h3>
        <RecordTable
          rows={tightestWars}
          columns={[
            { label: "Player", render: (c) => `${c.player_name} (${c.position})` },
            { label: "Winner", render: (c) => c.manager_name },
            { label: "Year", render: (c) => String(c.year) },
            { label: "Bid / Runner-up", render: (c: any) => `$${c.winning_bid} / $${c.maxOffer}`, alignRight: true },
          ]}
          empty="No contested claims for this era."
        />
      </div>

      {/* Best value pickups */}
      <div className="mb-4">
        <h3 className="font-display text-2xl text-gravy text-center mb-2">Best Value Pickups</h3>
        <p className="text-center font-mono text-[10px] text-gravy/50 mb-4">
          Points per $1 of FAAB &mdash; total season points on that roster, not just points after the pickup
        </p>
        <RecordTable
          rows={bestValue}
          columns={[
            { label: "Player", render: (c) => `${c.player_name} (${c.position})` },
            { label: "Manager", render: (c) => c.manager_name },
            { label: "Year", render: (c) => String(c.year) },
            { label: "Pts / Bid", render: (c: any) => `${c.points.toFixed(1)} / $${c.winning_bid} (${c.ppd.toFixed(1)}/$)`, alignRight: true },
          ]}
          empty="No value pickups found for this era."
        />
      </div>
    </section>
  );
}

function RecordTable<T>({
  rows,
  columns,
  empty,
}: {
  rows: T[];
  columns: { label: string; render: (row: T) => string; alignRight?: boolean }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-center font-body text-gravy/60 max-w-3xl mx-auto">{empty}</p>;
  }
  return (
    <div className="max-w-3xl mx-auto bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/20">
            {columns.map((col, i) => (
              <th key={i} className={`py-2 px-3 font-semibold ${col.alignRight ? "text-right" : "text-left"}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-biscuit/60 last:border-0">
              {columns.map((col, j) => (
                <td
                  key={j}
                  className={`py-2 px-3 ${j === 0 ? "font-semibold text-coffee" : "font-mono text-gravy/80"} ${
                    col.alignRight ? "text-right" : "text-left"
                  }`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
