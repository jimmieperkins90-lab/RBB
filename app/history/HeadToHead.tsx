"use client";

import { useMemo, useState } from "react";

type Manager = { id: number; name: string };
type Matchup = {
  year: number;
  week: number;
  manager_id: number;
  opponent_manager_id: number;
  score: number;
  win: boolean;
  time_of_season: string;
  round_game: string | null;
};

export default function HeadToHead({ managers, rows }: { managers: Manager[]; rows: Matchup[] }) {
  const [level1, setLevel1] = useState<number | null>(null);
  const [level2, setLevel2] = useState<number | null>(null);

  const managerName = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);

  // Level 1: overall record per manager (within current filters)
  const overall = useMemo(() => {
    const map = new Map<number, { w: number; l: number; pf: number; games: number }>();
    rows.forEach((r) => {
      const cur = map.get(r.manager_id) ?? { w: 0, l: 0, pf: 0, games: 0 };
      if (r.win) cur.w += 1;
      else cur.l += 1;
      cur.pf += Number(r.score ?? 0);
      cur.games += 1;
      map.set(r.manager_id, cur);
    });
    return managers
      .map((m) => {
        const c = map.get(m.id) ?? { w: 0, l: 0, pf: 0, games: 0 };
        return { id: m.id, name: m.name, w: c.w, l: c.l, pf: c.pf, games: c.games };
      })
      .filter((r) => r.games > 0)
      .sort((a, b) => (b.games ? b.w / b.games : 0) - (a.games ? a.w / a.games : 0));
  }, [rows, managers]);

  // Level 2: selected manager's record vs each opponent
  const vsOpponents = useMemo(() => {
    if (level1 == null) return [];
    const map = new Map<number, { w: number; l: number; pf: number; pa: number; games: number }>();
    rows
      .filter((r) => r.manager_id === level1)
      .forEach((r) => {
        const cur = map.get(r.opponent_manager_id) ?? { w: 0, l: 0, pf: 0, pa: 0, games: 0 };
        if (r.win) cur.w += 1;
        else cur.l += 1;
        cur.pf += Number(r.score ?? 0);
        cur.games += 1;
        map.set(r.opponent_manager_id, cur);
      });
    return Array.from(map.entries())
      .map(([oppId, c]) => ({ oppId, name: managerName.get(oppId) ?? "Unknown", ...c }))
      .sort((a, b) => b.games - a.games);
  }, [rows, level1, managerName]);

  // Level 3: individual games between the two selected managers
  const games = useMemo(() => {
    if (level1 == null || level2 == null) return [];
    return rows
      .filter((r) => r.manager_id === level1 && r.opponent_manager_id === level2)
      .map((r) => {
        const opp = rows.find(
          (o) => o.year === r.year && o.week === r.week && o.manager_id === level2 && o.opponent_manager_id === level1
        );
        return { ...r, oppScore: opp?.score ?? null };
      })
      .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.week - a.week));
  }, [rows, level1, level2]);

  if (level1 != null && level2 != null) {
    const oppName = managerName.get(level2);
    const meName = managerName.get(level1);
    return (
      <div>
        <button onClick={() => setLevel2(null)} className="font-mono text-xs text-burnt mb-4 hover:underline">
          &larr; Back to {meName}&rsquo;s opponents
        </button>
        <h3 className="font-display text-2xl text-gravy text-center mb-4">
          {meName} vs {oppName}
        </h3>
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
          <div className="divide-y divide-biscuit/60">
            {games.map((g, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div className="font-mono text-xs text-gravy/60">
                  {g.year} &middot; Wk {g.week} {g.round_game ? `\u00b7 ${g.round_game}` : ""}
                </div>
                <div className="font-mono text-sm font-bold">
                  <span className={g.win ? "text-green-700" : "text-burnt"}>{Number(g.score).toFixed(1)}</span>
                  <span className="text-gravy/40"> - </span>
                  <span className={!g.win ? "text-green-700" : "text-burnt"}>
                    {g.oppScore != null ? Number(g.oppScore).toFixed(1) : "\u2014"}
                  </span>
                </div>
              </div>
            ))}
            {games.length === 0 && <p className="text-center font-body text-gravy/70 py-4">No games found.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (level1 != null) {
    const meName = managerName.get(level1);
    return (
      <div>
        <button onClick={() => setLevel1(null)} className="font-mono text-xs text-burnt mb-4 hover:underline">
          &larr; Back to all managers
        </button>
        <h3 className="font-display text-2xl text-gravy text-center mb-4">{meName}&rsquo;s Record vs Each Opponent</h3>
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/30">
                <th className="text-left pl-4 py-2 font-semibold">Opponent</th>
                <th className="text-center py-2 font-semibold">Record</th>
                <th className="text-center pr-4 py-2 font-semibold">PF</th>
              </tr>
            </thead>
            <tbody>
              {vsOpponents.map((o) => (
                <tr
                  key={o.oppId}
                  onClick={() => setLevel2(o.oppId)}
                  className="border-b border-biscuit/60 last:border-0 cursor-pointer hover:bg-biscuit/20 transition-colors"
                >
                  <td className="pl-4 py-2 font-semibold text-coffee">{o.name}</td>
                  <td className="text-center py-2 font-mono">{o.w}-{o.l}</td>
                  <td className="text-center pr-4 py-2 font-mono">{o.pf.toFixed(1)}</td>
                </tr>
              ))}
              {vsOpponents.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-4 font-body text-gravy/70">
                    No matchups found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/30">
            <th className="text-left pl-4 py-2 font-semibold">Manager</th>
            <th className="text-center py-2 font-semibold">Record</th>
            <th className="text-center pr-4 py-2 font-semibold">PF</th>
          </tr>
        </thead>
        <tbody>
          {overall.map((r) => (
            <tr
              key={r.id}
              onClick={() => setLevel1(r.id)}
              className="border-b border-biscuit/60 last:border-0 cursor-pointer hover:bg-biscuit/20 transition-colors"
            >
              <td className="pl-4 py-2 font-semibold text-coffee">{r.name}</td>
              <td className="text-center py-2 font-mono">{r.w}-{r.l}</td>
              <td className="text-center pr-4 py-2 font-mono">{r.pf.toFixed(1)}</td>
            </tr>
          ))}
          {overall.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center py-4 font-body text-gravy/70">
                No data for these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-center font-mono text-[10px] text-gravy/50 py-2 bg-biscuit/20">Click a manager to see their record vs each opponent</p>
    </div>
  );
}
