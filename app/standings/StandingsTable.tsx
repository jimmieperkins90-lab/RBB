"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type StandingRow = {
  manager_id: number;
  managerName: string;
  division: string | null;
  final_place: string | null;
  made_finals: boolean | null;
  record: { w: number; l: number; pf: number };
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

export default function StandingsTable({
  standings,
  year,
  hasDivisions,
}: {
  standings: StandingRow[];
  year: number;
  hasDivisions: boolean;
}) {
  const [openManagerId, setOpenManagerId] = useState<number | null>(null);
  const [gamesByManager, setGamesByManager] = useState<Record<number, GameRow[]>>({});
  const [loadingManagerId, setLoadingManagerId] = useState<number | null>(null);

  const [openGameKey, setOpenGameKey] = useState<string | null>(null);
 const [rostersByGameKey, setRostersByGameKey] = useState<Record<string, { home: RosterEntry[]; away: RosterEntry[]; homeName: string; awayName: string }>>({});
  const [loadingGameKey, setLoadingGameKey] = useState<string | null>(null);

  async function toggleManager(managerId: number) {
    if (openManagerId === managerId) {
      setOpenManagerId(null);
      return;
    }
    setOpenManagerId(managerId);
    setOpenGameKey(null);
    if (gamesByManager[managerId]) return;

    setLoadingManagerId(managerId);
    const { data } = await supabase
      .from("matchups")
      .select("week, time_of_season, opponent_manager_id, score, opp_score, win, game_played, opponent:opponent_manager_id(name)")
      .eq("manager_id", managerId)
      .eq("year", year)
      .eq("game_played", true);

    const seasonOrder = (t: string) => (t === "Regular" ? 0 : t === "Playoff" ? 1 : 2);
    const rows: GameRow[] = (data ?? [])
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

    setGamesByManager((cur) => ({ ...cur, [managerId]: rows }));
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
            <th className="text-center pr-4 py-2 font-semibold">Finish</th>
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
                <td className="text-center pr-4 py-2 font-mono text-burnt font-bold">{t.final_place ?? "\u2014"}</td>
              </tr>
              {openManagerId === t.manager_id && (
                <tr key={`${t.manager_id}-expanded`} className="bg-cream/60">
                  <td colSpan={hasDivisions ? 6 : 5} className="px-4 py-3">
                    {loadingManagerId === t.manager_id && (
                      <p className="font-mono text-xs text-gravy/60">Loading games&hellip;</p>
                    )}
                    {gamesByManager[t.manager_id] && (
                      <div className="space-y-1">
                        {gamesByManager[t.manager_id].map((g) => {
                          const gameKey = `${t.manager_id}-${g.week}-${g.time_of_season}`;
                          const isGameOpen = openGameKey === gameKey;
                          return (
                            <div key={gameKey}>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleGame(t.manager_id, t.managerName, g);
                                }}
                                className="flex items-center justify-between px-3 py-1.5 rounded font-mono text-xs bg-plate border border-biscuit cursor-pointer hover:border-burnt transition-colors"
                              >
                                <span className="text-gravy/70">
                                  Wk {g.week}
                                  {g.time_of_season !== "Regular" ? ` \u00b7 ${g.time_of_season}` : ""}
                                </span>
                                <span className="text-coffee font-semibold">vs {g.opponentName}</span>
                                <span className={g.win ? "text-carolina font-bold" : "text-burnt font-bold"}>
                                  {g.score.toFixed(1)} - {g.oppScore.toFixed(1)}
                                </span>
                                <span className="text-gravy/40">{isGameOpen ? "\u25b2" : "\u25bc"}</span>
                              </div>
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
    </div>
  );
}

function RosterList({ label, entries }: { label: string; entries: RosterEntry[] }) {
  const starters = entries.filter((e) => e.lineup_pos !== "BN" && e.lineup_pos !== "IR");
  const bench = entries.filter((e) => e.lineup_pos === "BN" || e.lineup_pos === "IR");
  return (
    <div>
      <div className="font-mono text-[11px] uppercase text-gravy/60 mb-1">{label}</div>
      <div className="space-y-0.5">
        {starters.map((p, i) => (
          <div key={i} className="flex justify-between font-mono text-xs">
            <span className="text-gravy/50 w-10">{p.lineup_pos}</span>
            <span className="text-coffee flex-1">{p.player_name}</span>
            <span className="text-burnt font-semibold">{Number(p.points).toFixed(1)}</span>
          </div>
        ))}
        {bench.length > 0 && (
          <>
            <div className="font-mono text-[10px] uppercase text-gravy/40 mt-1.5">Bench / IR</div>
            {bench.map((p, i) => (
              <div key={i} className="flex justify-between font-mono text-xs opacity-60">
                <span className="text-gravy/50 w-10">{p.lineup_pos}</span>
                <span className="text-coffee flex-1">{p.player_name}</span>
                <span className="text-burnt font-semibold">{Number(p.points).toFixed(1)}</span>
              </div>
            ))}
          </>
        )}
        {entries.length === 0 && <p className="font-mono text-xs text-gravy/40">No lineup data.</p>}
      </div>
    </div>
  );
}
