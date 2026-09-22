"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type StandingRow = {
  manager_id: number;
  managerName: string;
  division: string | null;
  final_place: string | null;
  made_finals: boolean | null;
  record: { w: number; l: number; pf: number; pa: number };
};

type PlayoffOddsRow = {
  manager_id: number;
  playoff_pct: number;
  bye_pct: number;
  as_of_week: number;
};

type PossiblePointsRow = {
  manager_id: number;
  pctPlayed: number;
  totalLeftOnBench: number;
  avgLeftOnBench: number;
};

type GameRow = {
  week: number;
  time_of_season: string;
  opponent_manager_id: number;
  opponentName: string;
  score: number;
  oppScore: number;
  win: boolean;
};

type RosterEntry = {
  lineup_pos: string;
  player_name: string;
  player_position: string;
  points: number;
};

type WeekEfficiency = {
  actual: number;
  possible: number;
  pct: number;
  cumActual: number;
  cumPossible: number;
  cumPct: number;
};

// --- Optimal-lineup solver -------------------------------------------------
//
// Given everyone on a manager's roster that week (starters + bench, IR excluded)
// and the slot requirements actually used that week (derived from the real
// submitted lineup, so it auto-adapts across eras — e.g. K disappearing after
// 2021, DEF becoming DST in 2026), finds the highest-scoring legal lineup.
// This is a weighted bipartite assignment problem, solved exactly with the
// classic O(n^3) Hungarian algorithm (min-cost formulation; we negate to max).

const BIG = 10000; // exceeds any realistic single-player weekly score
const PENALTY = 1000000; // cost for an ineligible slot/player pairing — must never be chosen if any legal option exists

// DEF and DST are the same real-world position (team defense); everything else
// is compared as-is. FLEX accepts any RB/WR/TE-eligible player.
function canonicalPosition(pos: string): string {
  const p = pos.trim().toUpperCase();
  return p === "DST" ? "DEF" : p;
}

function parseEligiblePositions(playerPosition: string | null): Set<string> {
  if (!playerPosition) return new Set();
  const parts = playerPosition.split("/").map(canonicalPosition);
  const set = new Set(parts);
  if (set.has("RB") || set.has("WR") || set.has("TE")) set.add("FLEX");
  return set;
}

function slotMatches(slotType: string, eligible: Set<string>): boolean {
  return eligible.has(slotType);
}

// Standard e-maxx-style Hungarian algorithm for min-cost assignment on a square
// cost matrix. Returns rowToCol[i] = the column matched to row i.
function hungarianMinCost(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Infinity;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  }
  return rowToCol;
}

// slotTypes: one entry per required starting slot that week (e.g. ["QB","RB","RB","WR","WR","TE","FLEX","DEF"]).
// pool: every non-IR roster player that week (starters + bench) with their points and eligible positions.
function computeOptimalPoints(slotTypes: string[], pool: { points: number; eligible: Set<string> }[]): number {
  if (slotTypes.length === 0) return 0;
  const n = Math.max(slotTypes.length, pool.length);
  const cost: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    const isDummySlot = i >= slotTypes.length;
    for (let j = 0; j < n; j++) {
      const isDummyPlayer = j >= pool.length;
      if (isDummySlot || isDummyPlayer) {
        row.push(BIG); // "no points gained" baseline, consistent across the matrix
      } else if (slotMatches(slotTypes[i], pool[j].eligible)) {
        row.push(BIG - pool[j].points);
      } else {
        row.push(BIG + PENALTY);
      }
    }
    cost.push(row);
  }

  const rowToCol = hungarianMinCost(cost);
  let total = 0;
  for (let i = 0; i < slotTypes.length; i++) {
    const j = rowToCol[i];
    if (j >= 0 && j < pool.length && slotMatches(slotTypes[i], pool[j].eligible)) {
      total += pool[j].points;
    }
  }
  return total;
}

// -----------------------------------------------------------------------

export default function StandingsTable({
  standings,
  year,
  hasDivisions,
  seasonComplete,
  playoffOdds,
  possiblePointsStats,
}: {
  standings: StandingRow[];
  year: number;
  hasDivisions: boolean;
  seasonComplete: boolean;
  playoffOdds: PlayoffOddsRow[];
  possiblePointsStats: PossiblePointsRow[];
}) {
  const [openManagerId, setOpenManagerId] = useState<number | null>(null);
  const [gamesByManager, setGamesByManager] = useState<Record<number, GameRow[]>>({});
  const [efficiencyByManager, setEfficiencyByManager] = useState<Record<number, Map<string, WeekEfficiency>>>({});
  const [loadingManagerId, setLoadingManagerId] = useState<number | null>(null);

  const [openGameKey, setOpenGameKey] = useState<string | null>(null);
  const [rostersByGameKey, setRostersByGameKey] = useState<Record<string, { home: RosterEntry[]; away: RosterEntry[]; homeName: string; awayName: string }>>({});
  const [loadingGameKey, setLoadingGameKey] = useState<string | null>(null);

  const oddsByManager = new Map(playoffOdds.map((o) => [o.manager_id, o]));
  const oddsAsOfWeek = playoffOdds[0]?.as_of_week;
  const possibleByManager = new Map(possiblePointsStats.map((p) => [p.manager_id, p]));

  const colCount = (hasDivisions ? 7 : 6) + 3 + (seasonComplete ? 0 : 1);

  const seasonOrder = (t: string) => (t === "Regular" ? 0 : t === "Playoff" ? 1 : 2);

  async function toggleManager(managerId: number) {
    if (openManagerId === managerId) {
      setOpenManagerId(null);
      return;
    }
    setOpenManagerId(managerId);
    setOpenGameKey(null);
    if (gamesByManager[managerId]) return;

    setLoadingManagerId(managerId);
    const [matchupsRes, lineupsRes] = await Promise.all([
      supabase
        .from("matchups")
        .select("week, time_of_season, opponent_manager_id, score, opp_score, win, game_played, opponent:opponent_manager_id(name)")
        .eq("manager_id", managerId)
        .eq("year", year)
        .eq("game_played", true),
      supabase
        .from("lineups")
        .select("week, lineup_pos, player_name, player_position, points")
        .eq("manager_id", managerId)
        .eq("year", year)
        .neq("lineup_pos", "IR"),
    ]);

    const rows: GameRow[] = (matchupsRes.data ?? [])
      .map((r: any) => ({
        week: r.week,
        time_of_season: r.time_of_season,
        opponent_manager_id: r.opponent_manager_id,
        opponentName: r.opponent?.name ?? "Unknown",
        score: Number(r.score ?? 0),
        oppScore: Number(r.opp_score ?? 0),
        win: r.win,
      }))
      .sort((a, b) => seasonOrder(a.time_of_season) - seasonOrder(b.time_of_season) || a.week - b.week);

    // Every week's actual required slots come from that week's own submitted
    // lineup, so this doesn't need hardcoded per-era roster rules.
    const byWeek = new Map<number, { lineup_pos: string; player_position: string | null; points: number }[]>();
    (lineupsRes.data ?? []).forEach((r: any) => {
      const list = byWeek.get(r.week) ?? [];
      list.push({ lineup_pos: r.lineup_pos, player_position: r.player_position, points: Number(r.points ?? 0) });
      byWeek.set(r.week, list);
    });

    const efficiency = new Map<string, WeekEfficiency>();
    let cumActual = 0;
    let cumPossible = 0;
    rows.forEach((g) => {
      const weekRows = byWeek.get(g.week) ?? [];
      const actual = weekRows.filter((r) => r.lineup_pos !== "BN").reduce((sum, r) => sum + r.points, 0);
      const slotTypes = weekRows.filter((r) => r.lineup_pos !== "BN").map((r) => canonicalPosition(r.lineup_pos));
      const pool = weekRows.map((r) => ({ points: r.points, eligible: parseEligiblePositions(r.player_position) }));
      const possible = computeOptimalPoints(slotTypes, pool);
      const pct = possible > 0 ? (actual / possible) * 100 : 0;
      cumActual += actual;
      cumPossible += possible;
      const cumPct = cumPossible > 0 ? (cumActual / cumPossible) * 100 : 0;
      efficiency.set(`${g.week}-${g.time_of_season}`, { actual, possible, pct, cumActual, cumPossible, cumPct });
    });

    setGamesByManager((cur) => ({ ...cur, [managerId]: rows }));
    setEfficiencyByManager((cur) => ({ ...cur, [managerId]: efficiency }));
    setLoadingManagerId(null);
  }

  async function toggleGame(managerId: number, managerName: string, game: GameRow) {
    const key = `${managerId}-${game.week}-${game.time_of_season}`;
    if (openGameKey === key) {
      setOpenGameKey(null);
      return;
    }
    setOpenGameKey(key);
    if (rostersByGameKey[key]) return;

    setLoadingGameKey(key);
    const [homeRes, awayRes] = await Promise.all([
      supabase
        .from("lineups")
        .select("lineup_pos, player_name, player_position, points")
        .eq("manager_id", managerId)
        .eq("year", year)
        .eq("week", game.week),
      supabase
        .from("lineups")
        .select("lineup_pos, player_name, player_position, points")
        .eq("manager_id", game.opponent_manager_id)
        .eq("year", year)
        .eq("week", game.week),
    ]);

    setRostersByGameKey((cur) => ({
      ...cur,
      [key]: {
        home: (homeRes.data ?? []) as RosterEntry[],
        away: (awayRes.data ?? []) as RosterEntry[],
        homeName: managerName,
        awayName: game.opponentName,
      },
    }));
    setLoadingGameKey(null);
  }

  return (
    <div className="max-w-3xl mx-auto relative bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12]">
      <div className="pin-dot relative bg-burnt text-cream text-center py-3 rounded-t-md">
        <h3 className="font-display text-2xl tracking-wide">FULL LEAGUE</h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit">
            <th className="text-center py-2 font-semibold w-10">#</th>
            <th className="text-left py-2 font-semibold">Manager</th>
            {hasDivisions && <th className="text-left py-2 font-semibold">Division</th>}
            <th className="text-center py-2 font-semibold">Record</th>
            <th className="text-center py-2 font-semibold">PF</th>
            <th className="text-center py-2 font-semibold">PA</th>
            <th className="text-center py-2 font-semibold">% Max</th>
            <th className="text-center py-2 font-semibold">Missed Pts</th>
            <th className="text-center py-2 font-semibold">Avg Missed</th>
            <th className="text-center pr-4 py-2 font-semibold">
              {seasonComplete ? "Finish" : "Playoff Odds"}
            </th>
            {!seasonComplete && <th className="text-center pr-4 py-2 font-semibold">Bye Odds</th>}
          </tr>
        </thead>
        <tbody>
          {standings.map((t, i) => (
            <>
              <tr
                key={t.manager_id}
                onClick={() => toggleManager(t.manager_id)}
                className={`border-b border-biscuit/60 last:border-0 cursor-pointer hover:bg-biscuit/20 transition-colors ${
                  t.made_finals ? "bg-goldenrod/10" : ""
                }`}
              >
                <td className="text-center py-2 font-mono text-gravy/60">{i + 1}</td>
                <td className="py-2 font-semibold text-coffee">
                  {t.managerName}
                  {t.made_finals && <span className="ml-2 text-[10px] text-burnt font-mono">FINALS</span>}
                  <span className="ml-2 text-gravy/40 font-mono text-xs">{openManagerId === t.manager_id ? "\u25b2" : "\u25bc"}</span>
                </td>
                {hasDivisions && (
                  <td className="py-2 font-mono text-xs text-gravy/70">{t.division ?? "\u2014"}</td>
                )}
                <td className="text-center py-2 font-mono">{t.record.w}-{t.record.l}</td>
                <td className="text-center py-2 font-mono">{t.record.pf.toFixed(1)}</td>
                <td className="text-center py-2 font-mono">{t.record.pa.toFixed(1)}</td>
                <PossiblePointsCells stats={possibleByManager.get(t.manager_id)} />
                <td className="text-center pr-4 py-2 font-mono font-bold">
                  {seasonComplete ? (
                    <span className="text-burnt">{t.final_place ?? "\u2014"}</span>
                  ) : (
                    <PlayoffOddsCell odds={oddsByManager.get(t.manager_id)} />
                  )}
                </td>
                {!seasonComplete && (
                  <td className="text-center pr-4 py-2 font-mono font-bold">
                    <ByeOddsCell odds={oddsByManager.get(t.manager_id)} />
                  </td>
                )}
              </tr>
              {openManagerId === t.manager_id && (
                <tr key={`${t.manager_id}-expanded`} className="bg-cream/60">
                  <td colSpan={colCount} className="px-4 py-3">
                    {loadingManagerId === t.manager_id && (
                      <p className="font-mono text-xs text-gravy/60">Loading games&hellip;</p>
                    )}
                    {gamesByManager[t.manager_id] && (
                      <div className="space-y-1">
                        {gamesByManager[t.manager_id].map((g) => {
                          const gameKey = `${t.manager_id}-${g.week}-${g.time_of_season}`;
                          const isGameOpen = openGameKey === gameKey;
                          const eff = efficiencyByManager[t.manager_id]?.get(`${g.week}-${g.time_of_season}`);
                          return (
                            <div key={gameKey}>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleGame(t.manager_id, t.managerName, g);
                                }}
                                className="grid grid-cols-[48px_1fr_92px_16px] items-center gap-2 px-3 py-1.5 rounded font-mono text-xs bg-plate border border-biscuit cursor-pointer hover:border-burnt transition-colors"
                              >
                                <span className="text-gravy/70 whitespace-nowrap">Wk {g.week}</span>
                                <span className="text-coffee font-semibold truncate">
                                  vs {g.opponentName}
                                  {g.time_of_season !== "Regular" && (
                                    <span className="text-gravy/50 font-normal"> &middot; {g.time_of_season}</span>
                                  )}
                                </span>
                                <span className="text-right whitespace-nowrap">
                                  <span className={g.win ? "text-green-700 font-bold" : "text-burnt font-bold"}>
                                    {g.score.toFixed(1)}
                                  </span>
                                  <span className="text-gravy/50"> - {g.oppScore.toFixed(1)}</span>
                                </span>
                                <span className="text-gravy/40 text-center">{isGameOpen ? "\u25b2" : "\u25bc"}</span>
                              </div>
                              {eff && (
                                <div className="px-3 pt-0.5 pb-1 font-mono text-[10px] text-gravy/50 flex flex-wrap justify-between gap-x-3">
                                  <span>
                                    {eff.actual.toFixed(1)} of {eff.possible.toFixed(1)} possible pts &mdash; {eff.pct.toFixed(1)}%
                                  </span>
                                  <span>
                                    Season: {eff.cumActual.toFixed(1)} / {eff.cumPossible.toFixed(1)} &mdash; {eff.cumPct.toFixed(1)}%
                                  </span>
                                </div>
                              )}
                              {isGameOpen && (
                                <div className="px-3 py-3 border border-t-0 border-biscuit rounded-b bg-cream/80">
                                  {loadingGameKey === gameKey && (
                                    <p className="font-mono text-xs text-gravy/60">Loading rosters&hellip;</p>
                                  )}
                                  {rostersByGameKey[gameKey] && (
                                    <div className="grid sm:grid-cols-2 gap-4">
                                      <RosterList label={rostersByGameKey[gameKey].homeName} entries={rostersByGameKey[gameKey].home} />
                                      <RosterList label={rostersByGameKey[gameKey].awayName} entries={rostersByGameKey[gameKey].away} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      {!seasonComplete && oddsAsOfWeek != null && (
        <p className="text-center font-mono text-[10px] text-gravy/50 py-2 bg-biscuit/20">
          Playoff odds as of week {oddsAsOfWeek}
        </p>
      )}
    </div>
  );
}

// Season-long "coach's efficiency" cells: % of possible points actually scored,
// total points left on the bench, and the per-game average of that — all computed
// server-side in page.tsx from the same optimal-lineup solver as the per-manager
// week-by-week expansion below. Renders "—" for a season with no lineup data yet.
function PossiblePointsCells({ stats }: { stats: PossiblePointsRow | undefined }) {
  if (!stats) {
    return (
      <>
        <td className="text-center py-2 font-mono text-gravy/40">{"\u2014"}</td>
        <td className="text-center py-2 font-mono text-gravy/40">{"\u2014"}</td>
        <td className="text-center py-2 font-mono text-gravy/40">{"\u2014"}</td>
      </>
    );
  }
  return (
    <>
      <td className="text-center py-2 font-mono">{stats.pctPlayed.toFixed(1)}%</td>
      <td className="text-center py-2 font-mono">{stats.totalLeftOnBench.toFixed(1)}</td>
      <td className="text-center py-2 font-mono">{stats.avgLeftOnBench.toFixed(1)}</td>
    </>
  );
}

// Renders "—" until playoff_odds has a row for this manager (e.g. before the season
// starts, or before the first odds refresh of the year has been loaded).
function PlayoffOddsCell({ odds }: { odds: PlayoffOddsRow | undefined }) {
  if (!odds) return <span className="text-gravy/40">{"\u2014"}</span>;
  const pct = Math.round(Number(odds.playoff_pct));
  return <span className={pct >= 50 ? "text-green-700" : "text-burnt"}>{pct}%</span>;
}

// Top-2-seed (first-round bye) odds — same data source and same "—" fallback as
// PlayoffOddsCell, just reading bye_pct instead of playoff_pct. No [20,80] guardrail
// is applied to this one (see project notes: a ~17% baseline for a top-2-of-12 stat
// doesn't map cleanly onto the playoff-odds clamp logic).
function ByeOddsCell({ odds }: { odds: PlayoffOddsRow | undefined }) {
  if (!odds) return <span className="text-gravy/40">{"\u2014"}</span>;
  const pct = Math.round(Number(odds.bye_pct));
  return <span className={pct >= 25 ? "text-green-700" : "text-gravy/70"}>{pct}%</span>;
}

function RosterList({ label, entries }: { label: string; entries: RosterEntry[] }) {
  const starters = entries.filter((e) => e.lineup_pos !== "BN" && e.lineup_pos !== "IR");
  const bench = entries.filter((e) => e.lineup_pos === "BN" || e.lineup_pos === "IR");
  return (
    <div>
      <div className="font-mono text-[11px] uppercase text-gravy/60 mb-1">{label}</div>
      <div className="space-y-0.5">
        {starters.map((p, i) => (
          <div key={i} className="grid grid-cols-[36px_1fr_44px] items-center gap-1 font-mono text-xs">
            <span className="text-gravy/50">{p.lineup_pos}</span>
            <span className="text-coffee truncate">{p.player_name}</span>
            <span className="text-burnt font-semibold text-right">{Number(p.points).toFixed(1)}</span>
          </div>
        ))}
        {bench.length > 0 && (
          <>
            <div className="font-mono text-[10px] uppercase text-gravy/40 mt-1.5">Bench / IR</div>
            {bench.map((p, i) => (
              <div key={i} className="grid grid-cols-[36px_1fr_44px] items-center gap-1 font-mono text-xs opacity-60">
                <span className="text-gravy/50">{p.lineup_pos}</span>
                <span className="text-coffee truncate">{p.player_name}</span>
                <span className="text-burnt font-semibold text-right">{Number(p.points).toFixed(1)}</span>
              </div>
            ))}
          </>
        )}
        {entries.length === 0 && <p className="font-mono text-xs text-gravy/40">No lineup data.</p>}
      </div>
    </div>
  );
}
