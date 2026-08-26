"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

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

type LineupRow = {
  lineup_pos: string;
  player_name: string;
  player_position: string;
  points: number | null;
  proj_points: number | null;
  is_keeper: boolean | null;
};

const POS_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  FLEX: 4,
  K: 5,
  DEF: 6,
  BN: 7,
  IR: 8,
};

// Playoff and TB brackets can share the same round_game label (e.g. "Championship"
// appears in both), so this disambiguates which bracket a game happened in.
function roundTag(timeOfSeason: string, roundGame: string | null): string {
  if (!roundGame || timeOfSeason === "Regular") return "";
  const bracket = timeOfSeason === "TB" ? "TB" : "Playoff";
  return ` \u00b7 ${roundGame} (${bracket})`;
}

function sortByPos(rows: LineupRow[]) {
  return rows.slice().sort((a, b) => (POS_ORDER[a.lineup_pos] ?? 99) - (POS_ORDER[b.lineup_pos] ?? 99));
}

async function fetchLineup(year: number, week: number, managerId: number): Promise<LineupRow[]> {
  const { data } = await supabase
    .from("lineups")
    .select("lineup_pos, player_name, player_position, points, proj_points, is_keeper")
    .eq("year", year)
    .eq("week", week)
    .eq("manager_id", managerId);
  return sortByPos((data ?? []) as LineupRow[]);
}

function MiniPlayerTable({ rows }: { rows: LineupRow[] }) {
  return (
    <div className="divide-y divide-biscuit/60">
      {rows.map((r, i) => {
        const pts = Number(r.points ?? 0);
        const proj = Number(r.proj_points ?? 0);
        const beat = pts >= proj;
        const bench = r.lineup_pos === "BN" || r.lineup_pos === "IR";
        return (
          <div key={i} className={`flex items-center justify-between px-3 py-1.5 ${bench ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[9px] text-gravy/50 w-7 flex-shrink-0">{r.lineup_pos}</span>
              <span className="text-xs font-semibold text-coffee truncate">{r.player_name}</span>
              <span className="font-mono text-[9px] text-gravy/40 flex-shrink-0">{r.player_position}</span>
              {r.is_keeper && (
                <span className="text-[8px] font-mono uppercase bg-goldenrod/30 text-gravy px-1 py-0.5 rounded flex-shrink-0">
                  K
                </span>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`font-mono text-xs font-bold ${beat ? "text-green-700" : "text-burnt"}`}>{pts.toFixed(1)}</span>
              <span className="font-mono text-[9px] text-gravy/40 ml-1">/{proj.toFixed(1)}</span>
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-center font-mono text-[10px] text-gravy/40 py-3">No lineup data.</p>}
    </div>
  );
}

function GameLineupsPanel({
  year,
  week,
  meId,
  meName,
  oppId,
  oppName,
}: {
  year: number;
  week: number;
  meId: number;
  meName?: string;
  oppId: number;
  oppName?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [meLineup, setMeLineup] = useState<LineupRow[]>([]);
  const [oppLineup, setOppLineup] = useState<LineupRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchLineup(year, week, meId), fetchLineup(year, week, oppId)]).then(([a, b]) => {
      if (cancelled) return;
      setMeLineup(a);
      setOppLineup(b);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, week, meId, oppId]);

  if (loading) {
    return <p className="text-center font-mono text-xs text-gravy/50 py-4 bg-biscuit/10">Loading lineups&hellip;</p>;
  }

  return (
    <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-biscuit/60 bg-biscuit/10">
      <div>
        <div className="px-3 py-1.5 bg-gravy text-cream font-mono text-[10px] font-bold uppercase">{meName ?? "\u2014"}</div>
        <MiniPlayerTable rows={meLineup} />
      </div>
      <div>
        <div className="px-3 py-1.5 bg-gravy text-cream font-mono text-[10px] font-bold uppercase">{oppName ?? "\u2014"}</div>
        <MiniPlayerTable rows={oppLineup} />
      </div>
    </div>
  );
}

export default function HeadToHead({ managers, rows }: { managers: Manager[]; rows: Matchup[] }) {
  const [level1, setLevel1] = useState<number | null>(null);
  const [level2, setLevel2] = useState<number | null>(null);
  // Composite "year-week" key so two games in the same week number across
  // different years never get confused as the same expanded row.
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

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
        <button
          onClick={() => {
            setLevel2(null);
            setExpandedGame(null);
          }}
          className="font-mono text-xs text-burnt mb-4 hover:underline"
        >
          &larr; Back to {meName}&rsquo;s opponents
        </button>
        <h3 className="font-display text-2xl text-gravy text-center mb-4">
          {meName} vs {oppName}
        </h3>
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
          <div className="divide-y divide-biscuit/60">
            {games.map((g, i) => {
              const gameKey = `${g.year}-${g.week}`;
              const isOpen = expandedGame === gameKey;
              return (
                <div key={i}>
                  <button
                    onClick={() => setExpandedGame(isOpen ? null : gameKey)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-biscuit/20 transition-colors text-left"
                  >
                    <div className="font-mono text-xs text-gravy/60">
                      {g.year} &middot; Wk {g.week}
                      {roundTag(g.time_of_season, g.round_game)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm font-bold">
                        <span className={g.win ? "text-green-700" : "text-burnt"}>{Number(g.score).toFixed(1)}</span>
                        <span className="text-gravy/40"> - </span>
                        <span className={!g.win ? "text-green-700" : "text-burnt"}>
                          {g.oppScore != null ? Number(g.oppScore).toFixed(1) : "\u2014"}
                        </span>
                      </div>
                      <span className={`font-mono text-[10px] text-gravy/40 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                        &#9660;
                      </span>
                    </div>
                  </button>
                  {isOpen && (
                    <GameLineupsPanel
                      year={g.year}
                      week={g.week}
                      meId={level1}
                      meName={meName}
                      oppId={level2}
                      oppName={oppName}
                    />
                  )}
                </div>
              );
            })}
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
