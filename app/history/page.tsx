"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import HeadToHead from "./HeadToHead";

type Season = { year: number; num_teams: number };
type Manager = { id: number; name: string };
type TeamSeason = { manager_id: number; year: number; final_place: string | null };
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
type Championship = { year: number; manager_id: number };

function ordinalToNumber(v: string | null): number {
  if (!v) return 999;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 999 : n;
}

function formatFinishes(places: Map<string, number[]> | undefined): string {
  if (!places || places.size === 0) return "\u2014";
  return Array.from(places.entries())
    .sort((a, b) => ordinalToNumber(a[0]) - ordinalToNumber(b[0]))
    .map(([place, years]) => {
      const sortedYears = [...years].sort((a, b) => a - b);
      return `${place} (${sortedYears.map((y) => `'${String(y).slice(2)}`).join(", ")})`;
    })
    .join(", ");
}

export default function HistoryPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);

  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const [teamCountFilter, setTeamCountFilter] = useState<"all" | 10 | 12>("all");
  const [seasonType, setSeasonType] = useState<"all" | "regular" | "playoffs">("all");

  useEffect(() => {
    Promise.all([
      supabase.from("seasons").select("year, num_teams").order("year", { ascending: false }),
      supabase.from("managers").select("id, name").order("name", { ascending: true }),
      supabase.from("team_seasons").select("manager_id, year, final_place").range(0, 1999),
      supabase
        .from("matchups")
        .select("year, week, manager_id, opponent_manager_id, score, win, game_played, time_of_season, round_game")
        .eq("game_played", true)
        .range(0, 4999),
      supabase.from("championships").select("year, manager_id").eq("type", "league"),
    ]).then(([s, m, ts, mu, ch]) => {
      setSeasons((s.data ?? []) as Season[]);
      setManagers((m.data ?? []) as Manager[]);
      setTeamSeasons((ts.data ?? []) as TeamSeason[]);
      setMatchups((mu.data ?? []) as Matchup[]);
      setChampionships((ch.data ?? []) as Championship[]);
      setLoading(false);
    });
  }, []);

  const yearToTeams = useMemo(() => new Map(seasons.map((s) => [s.year, s.num_teams])), [seasons]);

  const filteredMatchups = useMemo(() => {
    return matchups.filter((r) => {
      if (yearFilter !== "all" && r.year !== yearFilter) return false;
      if (teamCountFilter !== "all" && yearToTeams.get(r.year) !== teamCountFilter) return false;
      if (seasonType === "regular" && r.time_of_season !== "Regular") return false;
      if (seasonType === "playoffs" && r.time_of_season !== "Playoff" && r.time_of_season !== "TB") return false;
      return true;
    });
  }, [matchups, yearFilter, teamCountFilter, seasonType, yearToTeams]);

  const filteredTeamSeasons = useMemo(() => {
    return teamSeasons.filter((r) => {
      if (yearFilter !== "all" && r.year !== yearFilter) return false;
      if (teamCountFilter !== "all" && yearToTeams.get(r.year) !== teamCountFilter) return false;
      return true;
    });
  }, [teamSeasons, yearFilter, teamCountFilter, yearToTeams]);

  const managerName = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);

  // Finish placements by manager id -> place -> years[] (shared by All-Time Records + Finish History)
  const finishMapByManager = useMemo(() => {
    const byManager = new Map<number, Map<string, number[]>>();
    filteredTeamSeasons.forEach((r) => {
      if (!r.final_place) return;
      if (!byManager.has(r.manager_id)) byManager.set(r.manager_id, new Map());
      const places = byManager.get(r.manager_id)!;
      if (!places.has(r.final_place)) places.set(r.final_place, []);
      places.get(r.final_place)!.push(r.year);
    });
    return byManager;
  }, [filteredTeamSeasons]);

  // Career records
  const careerTable = useMemo(() => {
    const career = new Map<number, { w: number; l: number; pf: number; games: number }>();
    filteredMatchups.forEach((r) => {
      const cur = career.get(r.manager_id) ?? { w: 0, l: 0, pf: 0, games: 0 };
      if (r.win) cur.w += 1;
      else cur.l += 1;
      cur.pf += Number(r.score ?? 0);
      cur.games += 1;
      career.set(r.manager_id, cur);
    });
    const champCounts = new Map<number, number>();
    championships.forEach((c) => {
      if (yearFilter !== "all" && c.year !== yearFilter) return;
      champCounts.set(c.manager_id, (champCounts.get(c.manager_id) ?? 0) + 1);
    });
    return managers
      .map((m) => {
        const c = career.get(m.id) ?? { w: 0, l: 0, pf: 0, games: 0 };
        return {
          id: m.id,
          name: m.name,
          w: c.w,
          l: c.l,
          winPct: c.games > 0 ? c.w / c.games : 0,
          pf: c.pf,
          ppg: c.games > 0 ? c.pf / c.games : 0,
          titles: champCounts.get(m.id) ?? 0,
          games: c.games,
          finishes: formatFinishes(finishMapByManager.get(m.id)),
        };
      })
      .filter((r) => r.games > 0)
      .sort((a, b) => b.winPct - a.winPct);
  }, [filteredMatchups, managers, championships, yearFilter, finishMapByManager]);

  // League records
  const leagueRecords = useMemo(() => {
    const bestGame = filteredMatchups.reduce((max, r) => (r.score > (max?.score ?? -1) ? r : max), null as Matchup | null);
    const worstGame = filteredMatchups.reduce((min, r) => (r.score < (min?.score ?? Infinity) ? r : min), null as Matchup | null);

    const pairMap = new Map<string, Matchup[]>();
    filteredMatchups.forEach((r) => {
      const key = [r.year, r.time_of_season, r.week, Math.min(r.manager_id, r.opponent_manager_id), Math.max(r.manager_id, r.opponent_manager_id)].join("-");
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key)!.push(r);
    });
    let largestMargin: { year: number; winner: number; loser: number; margin: number; winnerScore: number; loserScore: number } | null = null;
    pairMap.forEach((pair) => {
      if (pair.length < 2) return;
      const [a, b] = pair;
      const margin = Math.abs(Number(a.score) - Number(b.score));
      if (!largestMargin || margin > largestMargin.margin) {
        const winner = a.win ? a : b;
        const loser = a.win ? b : a;
        largestMargin = {
          year: a.year,
          winner: winner.manager_id,
          loser: loser.manager_id,
          margin,
          winnerScore: Number(winner.score),
          loserScore: Number(loser.score),
        };
      }
    });

    const seasonMap = new Map<string, { manager_id: number; year: number; w: number; l: number; pf: number }>();
    filteredMatchups.forEach((r) => {
      const key = `${r.manager_id}-${r.year}`;
      if (!seasonMap.has(key)) seasonMap.set(key, { manager_id: r.manager_id, year: r.year, w: 0, l: 0, pf: 0 });
      const s = seasonMap.get(key)!;
      if (r.win) s.w += 1;
      else s.l += 1;
      s.pf += Number(r.score ?? 0);
    });
    const seasonRows = Array.from(seasonMap.values());
    const mostWinsSeason = seasonRows.reduce((max, s) => (s.w > (max?.w ?? -1) ? s : max), null as any);
    const mostPointsSeason = seasonRows.reduce((max, s) => (s.pf > (max?.pf ?? -1) ? s : max), null as any);

    return { bestGame, worstGame, largestMargin, mostWinsSeason, mostPointsSeason };
  }, [filteredMatchups]);

  // Finish history
  const finishHistory = useMemo(() => {
    return managers
      .map((m) => {
        const places = finishMapByManager.get(m.id);
        if (!places) return { id: m.id, name: m.name, entries: [] as { place: string; years: number[] }[] };
        const entries = Array.from(places.entries())
          .map(([place, years]) => ({ place, years: years.sort((a, b) => a - b) }))
          .sort((a, b) => ordinalToNumber(a.place) - ordinalToNumber(b.place));
        return { id: m.id, name: m.name, entries };
      })
      .filter((m) => m.entries.length > 0);
  }, [finishMapByManager, managers]);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Ten seasons of receipts</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">LEAGUE HISTORY</h1>
        </div>
      </section>

      {/* Filters */}
      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          <button
            onClick={() => setYearFilter("all")}
            className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
              yearFilter === "all" ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
            }`}
          >
            All
          </button>
          {seasons.map((s) => (
            <button
              key={s.year}
              onClick={() => setYearFilter(s.year)}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                yearFilter === s.year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {s.year}
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 mt-4 flex flex-wrap items-start justify-center gap-8">
        <div>
          <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">League Size</p>
          <div className="flex flex-wrap items-center gap-1.5 justify-center">
            {(["all", 10, 12] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTeamCountFilter(v)}
                className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                  teamCountFilter === v ? "bg-gravy text-cream border-gravy" : "bg-transparent text-gravy border-biscuit hover:border-gravy"
                }`}
              >
                {v === "all" ? "All" : `${v} Team`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Game Type</p>
          <div className="flex flex-wrap items-center gap-1.5 justify-center">
            {(["all", "regular", "playoffs"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setSeasonType(v)}
                className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                  seasonType === v ? "bg-goldenrod text-coffee border-goldenrod" : "bg-transparent text-gravy border-biscuit hover:border-goldenrod"
                }`}
              >
                {v === "all" ? "All" : v === "regular" ? "Regular Season" : "Playoffs"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading && <p className="text-center font-body text-gravy/60 py-14">Loading&hellip;</p>}

      {!loading && (
        <>
          {/* Career records */}
          <section className="max-w-5xl mx-auto px-5 py-14">
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl text-gravy chalk-shadow">ALL-TIME RECORDS</h2>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/30">
                    <th className="text-left pl-4 py-2 font-semibold">Manager</th>
                    <th className="text-center py-2 font-semibold">Record</th>
                    <th className="text-center py-2 font-semibold">Win%</th>
                    <th className="text-center py-2 font-semibold">PPG</th>
                    <th className="text-center py-2 font-semibold">Titles</th>
                    <th className="text-left pr-4 py-2 font-semibold">Finishes</th>
                  </tr>
                </thead>
                <tbody>
                  {careerTable.map((r, i) => (
                    <tr key={i} className={`border-b border-biscuit/60 last:border-0 ${r.titles > 0 ? "bg-carolina/10" : ""}`}>
                      <td className="pl-4 py-2 font-semibold text-coffee align-top whitespace-nowrap">{r.name}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.w}-{r.l}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{(r.winPct * 100).toFixed(1)}%</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.ppg.toFixed(1)}</td>
                      <td className="text-center py-2 font-mono text-carolina font-bold align-top whitespace-nowrap">{r.titles > 0 ? r.titles : "\u2014"}</td>
                      <td className="text-left pr-4 py-2 font-mono text-xs text-gravy/80 align-top max-w-[320px] whitespace-normal">{r.finishes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* League records */}
          <section className="max-w-4xl mx-auto px-5 pb-14">
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl text-gravy chalk-shadow">LEAGUE RECORDS</h2>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <RecordCard
                title="Highest Single Score"
                value={leagueRecords.bestGame ? Number(leagueRecords.bestGame.score).toFixed(1) : "\u2014"}
                detail={leagueRecords.bestGame ? `${managerName.get(leagueRecords.bestGame.manager_id)} \u00b7 ${leagueRecords.bestGame.year}` : ""}
              />
              <RecordCard
                title="Lowest Single Score"
                value={leagueRecords.worstGame ? Number(leagueRecords.worstGame.score).toFixed(1) : "\u2014"}
                detail={leagueRecords.worstGame ? `${managerName.get(leagueRecords.worstGame.manager_id)} \u00b7 ${leagueRecords.worstGame.year}` : ""}
              />
              <RecordCard
                title="Largest Win Margin"
                value={leagueRecords.largestMargin ? `${(leagueRecords.largestMargin as any).margin.toFixed(1)} pts` : "\u2014"}
                detail={
                  leagueRecords.largestMargin
                    ? `${managerName.get((leagueRecords.largestMargin as any).winner)} def. ${managerName.get((leagueRecords.largestMargin as any).loser)} \u00b7 ${(leagueRecords.largestMargin as any).year}`
                    : ""
                }
              />
              <RecordCard
                title="Most Wins, Single Season"
                value={leagueRecords.mostWinsSeason ? `${leagueRecords.mostWinsSeason.w}-${leagueRecords.mostWinsSeason.l}` : "\u2014"}
                detail={leagueRecords.mostWinsSeason ? `${managerName.get(leagueRecords.mostWinsSeason.manager_id)} \u00b7 ${leagueRecords.mostWinsSeason.year}` : ""}
              />
              <RecordCard
                title="Most Points, Single Season"
                value={leagueRecords.mostPointsSeason ? Number(leagueRecords.mostPointsSeason.pf).toFixed(1) : "\u2014"}
                detail={leagueRecords.mostPointsSeason ? `${managerName.get(leagueRecords.mostPointsSeason.manager_id)} \u00b7 ${leagueRecords.mostPointsSeason.year}` : ""}
              />
            </div>
          </section>

          {/* Finish history */}
          <section className="max-w-4xl mx-auto px-5 pb-14">
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl text-gravy chalk-shadow">FINISH HISTORY</h2>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            <div className="space-y-4">
              {finishHistory.length === 0 && (
                <p className="text-center font-body text-gravy/70">No finish data for these filters.</p>
              )}
              {finishHistory.map((m) => (
                <div key={m.id} className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
                  <div className="px-4 py-2 bg-burnt text-cream font-display text-lg tracking-wide">{m.name}</div>
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {m.entries.map((e, i) => (
                      <span key={i} className="font-mono text-xs bg-biscuit/40 text-gravy px-2 py-1 rounded">
                        {e.place} &times;{e.years.length}{" "}
                        <span className="text-gravy/50">({e.years.map((y) => `'${String(y).slice(2)}`).join(", ")})</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Head-to-head */}
          <section className="max-w-3xl mx-auto px-5 pb-16">
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl text-gravy chalk-shadow">HEAD-TO-HEAD</h2>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            <HeadToHead managers={managers} rows={filteredMatchups} />
          </section>
        </>
      )}
    </div>
  );
}

function RecordCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
      <div className="px-4 py-2 bg-gravy text-cream font-mono text-xs font-bold uppercase">{title}</div>
      <div className="px-4 py-3">
        <div className="font-display text-3xl text-burnt">{value}</div>
        <div className="font-mono text-xs text-gravy/60 mt-1">{detail}</div>
      </div>
    </div>
  );
}
