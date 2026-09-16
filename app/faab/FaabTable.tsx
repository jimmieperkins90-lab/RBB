"use client";

import { Fragment, useMemo, useState } from "react";

type Offer = { manager_id: number; manager_name: string; amount: number; reason: string };
type Claim = {
  id: number;
  player_name: string;
  nfl_team: string;
  position: string;
  status: string | null;
  winning_bid: number;
  award_date: string;
  manager_id: number;
  manager_name: string;
  offers: Offer[];
};

export default function FaabTable({ claims, year }: { claims: Claim[]; year: number }) {
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [openClaimId, setOpenClaimId] = useState<number | null>(null);

  const managers = useMemo(() => {
    const names = Array.from(new Set(claims.map((c) => c.manager_name)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [claims]);

  const filtered = useMemo(() => {
    if (managerFilter === "all") return claims;
    return claims.filter((c) => c.manager_name === managerFilter);
  }, [claims, managerFilter]);

  return (
    <div>
      <div className="max-w-5xl mx-auto mb-6">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Team</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <button
            onClick={() => setManagerFilter("all")}
            className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
              managerFilter === "all" ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
            }`}
          >
            All
          </button>
          {managers.map((m) => (
            <button
              key={m}
              onClick={() => setManagerFilter(m)}
              className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                managerFilter === m ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/20">
              <th className="text-left py-2 px-3 font-semibold">Player</th>
              <th className="text-left py-2 px-3 font-semibold hidden sm:table-cell">Team</th>
              <th className="text-left py-2 px-3 font-semibold">Awarded To</th>
              <th className="text-center py-2 px-3 font-semibold">Bid</th>
              <th className="text-right py-2 pr-4 font-semibold hidden md:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const isOpen = openClaimId === c.id;
              const topOffer = c.offers[0];
              return (
                <Fragment key={c.id}>
                  <tr
                    onClick={() => setOpenClaimId(isOpen ? null : c.id)}
                    className="border-b border-biscuit/60 last:border-0 cursor-pointer hover:bg-biscuit/20 transition-colors"
                  >
                    <td className="py-2 px-3 font-semibold text-coffee">
                      {c.player_name}
                      <span className="font-mono text-[10px] text-gravy/40 ml-1.5">{c.position}</span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-gravy/70 hidden sm:table-cell">{c.nfl_team}</td>
                    <td className="py-2 px-3 text-coffee">
                      {c.manager_name}
                      {c.offers.length > 0 && (
                        <span className="ml-2 text-gravy/40 font-mono text-xs">{isOpen ? "\u25b2" : "\u25bc"}</span>
                      )}
                    </td>
                    <td className="text-center py-2 px-3 font-mono font-bold text-burnt">${c.winning_bid}</td>
                    <td className="text-right py-2 pr-4 font-mono text-xs text-gravy/50 hidden md:table-cell">{c.award_date}</td>
                  </tr>
                  {isOpen && c.offers.length > 0 && (
                    <tr className="bg-cream/60">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="font-mono text-[10px] uppercase text-gravy/50 mb-2">Other Offers</div>
                        <div className="space-y-1">
                          {c.offers.map((o, i) => (
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
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-center font-body text-gravy/70 mt-6">No claims for this team in {year}.</p>
      )}
    </div>
  );
}
