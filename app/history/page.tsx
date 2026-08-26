"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import HeadToHead from "./HeadToHead";

type Season = { year: number; num_teams: number };
type Manager = { id: number; name: string };
type TeamSeason = { manager_id: number; year: number; final_place: string | null; regular_season_place: string | null };
type Matchup = {
  year: number;
  week: number;
  manager_id: number;
  opponent_manager_id: number;
  score: number;
  win: boolean;
  time_of_season: string;
  round_game: string | null;
  seed: number | null;
};
type Championship = { year: number; manager_id: number };

function ordinalToNumber(v: string | null): number {
  if (!v) return 999;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 999 : n;
}

function formatYears(years: number[] | undefined): string {
  if (!years || years.length === 0) return "\u2014";
  return [...years].sort((a, b) => a - b).map((y) => `'${String(y).slice(2)}`).join(", ");
}

// Pages through a Supabase query in chunks so results are never silently
// truncated by the project's "Max Rows" API setting, no matter how large
// the table grows in future seasons.
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export default function HistoryPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [teamSeasons, setTeamSeasons] = useState<TeamSeason[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [loading, setLoading] = useState(true);

  const [yearFilter, setYearFilter] = useState<"all" | number>("all");
  const [teamCountFilter, setTeamCountFilter] = useState<"all" | 10 | 12>(12);
  const [seasonType, setSeasonType] = useState<"all" | "regular" | "playoffs">("all");
  const [recordsFilterId, setRecordsFilterId] = useState<number | "all">("all");

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      const [s, m, ts, mu, ch] = await Promise.all([
        supabase.from("seasons").select("year, num_teams").order("year", { ascending: false }),
        supabase.from("managers").select("id, name").order("name", { ascending: true }),
        fetchAllRows<TeamSeason>((from, to) =>
          supabase.from("team_seasons").select("manager_id, year, final_place, regular_season_place").range(from, to)
        ),
        fetchAllRows<Matchup>((from, to) =>
          supabase
            .from("matchups")
            .select("year, week, manager_id, opponent_manager_id, score, win, game_played, time_of_season, round_game, seed")
            .eq("game_played", true)
            .range(from, to)
        ),
        supabase.from("championships").select("year, manager_id").eq("type", "league"),
      ]);

      if (cancelled) return;
      setSeasons((s.data ?? []) as Season[]);
      setManagers((m.data ?? []) as Manager[]);
      setTeamSeasons(ts as TeamSeason[]);
      setMatchups(mu as Matchup[]);
      setChampionships((ch.data ?? []) as Championship[]);
      setLoading(false);
    }

    loadAll();
    return () => {
      cancelled = true;
    };
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

  // Year/team-size filtered, but NOT game-type filtered — used for career-identity stats
  // (playoff appearances) that shouldn't disappear when Game Type = Regular/Playoffs.
  const yearScopedMatchups = useMemo(() => {
    return matchups.filter((r) => {
      if (yearFilter !== "all" && r.year !== yearFilter) return false;
      if (teamCountFilter !== "all" && yearToTeams.get(r.year) !== teamCountFilter) return false;
      return true;
    });
  }, [matchups, yearFilter, teamCountFilter, yearToTeams]);

  const filteredTeamSeasons = useMemo(() => {
    return teamSeasons.filter((r) => {
      if (yearFilter !== "all" && r.year !== yearFilter) return false;
      if (teamCountFilter !== "all" && yearToTeams.get(r.year) !== teamCountFilter) return false;
      return true;
    });
  }, [teamSeasons, yearFilter, teamCountFilter, yearToTeams]);

  const managerName = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);

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

  const allPlaces = useMemo(() => {
    const set = new Set<string>();
    filteredTeamSeasons.forEach((r) => {
      if (r.final_place) set.add(r.final_place);
    });
    return Array.from(set).sort((a, b) => ordinalToNumber(a) - ordinalToNumber(b));
  }, [filteredTeamSeasons]);

  const seasonsPlayedCounts = useMemo(() => {
    const byManager = new Map<number, Set<number>>();
    filteredTeamSeasons.forEach((r) => {
      if (!byManager.has(r.manager_id)) byManager.set(r.manager_id, new Set());
      byManager.get(r.manager_id)!.add(r.year);
    });
    const counts = new Map<number, number>();
    byManager.forEach((yearsSet, managerId) => counts.set(managerId, yearsSet.size));
    return counts;
  }, [filteredTeamSeasons]);

  const playoffAppearanceCounts = useMemo(() => {
    const byManagerYears = new Map<number, Set<number>>();
    yearScopedMatchups.forEach((r) => {
      if (r.time_of_season !== "Playoff") return;
      if (!byManagerYears.has(r.manager_id)) byManagerYears.set(r.manager_id, new Set());
      byManagerYears.get(r.manager_id)!.add(r.year);
    });
    const counts = new Map<number, number>();
    byManagerYears.forEach((yearsSet, managerId) => counts.set(managerId, yearsSet.size));
    return counts;
  }, [yearScopedMatchups]);

  const regularSeasonTitleCounts = useMemo(() => {
    const counts = new Map<number, number>();
    filteredTeamSeasons.forEach((r) => {
      if (r.regular_season_place !== "1st") return;
      counts.set(r.manager_id, (counts.get(r.manager_id) ?? 0) + 1);
    });
    return counts;
  }, [filteredTeamSeasons]);

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
        const places = finishMapByManager.get(m.id);
        return {
          id: m.id,
          name: m.name,
          w: c.w,
          l: c.l,
          winPct: c.games > 0 ? c.w / c.games : 0,
          pf: c.pf,
          ppg: c.games > 0 ? c.pf / c.games : 0,
          titles: champCounts.get(m.id) ?? 0,
          regSeasonTitles: regularSeasonTitleCounts.get(m.id) ?? 0,
          seasonsPlayed: seasonsPlayedCounts.get(m.id) ?? 0,
          playoffApps: playoffAppearanceCounts.get(m.id) ?? 0,
          games: c.games,
          places,
        };
      })
      .filter((r) => r.games > 0)
      .sort((a, b) => b.w - a.w);
  }, [filteredMatchups, managers, championships, yearFilter, finishMapByManager, regularSeasonTitleCounts, seasonsPlayedCounts, playoffAppearanceCounts]);

  // League records — top 3 per category
  const leagueRecords = useMemo(() => {
    const topScores = [...filteredMatchups].sort((a, b) => b.score - a.score).slice(0, 3);
    const lowScores = [...filteredMatchups].sort((a, b) => a.score - b.score).slice(0, 3);

    const pairMap = new Map<string, Matchup[]>();
    filteredMatchups.forEach((r) => {
      const key = [r.year, r.time_of_season, r.week, Math.min(r.manager_id, r.opponent_manager_id), Math.max(r.manager_id, r.opponent_manager_id)].join("-");
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key)!.push(r);
    });
    const margins: { year: number; winner: number; loser: number; margin: number }[] = [];
    pairMap.forEach((pair) => {
      if (pair.length < 2) return;
      const [a, b] = pair;
      const margin = Math.abs(Number(a.score) - Number(b.score));
      const winner = a.win ? a : b;
      const loser = a.win ? b : a;
      margins.push({ year: a.year, winner: winner.manager_id, loser: loser.manager_id, margin });
    });
    margins.sort((a, b) => b.margin - a.margin);
    const topMargins = margins.slice(0, 3);

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
    const topWinsSeasons = [...seasonRows].sort((a, b) => b.w - a.w || b.pf - a.pf).slice(0, 3);
    const topPointsSeasons = [...seasonRows].sort((a, b) => b.pf - a.pf).slice(0, 3);

    return { topScores, lowScores, topMargins, topWinsSeasons, topPointsSeasons };
  }, [filteredMatchups]);

  // Same category set as League Records, scoped down to one manager's own games/seasons.
  const individualRecords = useMemo(() => {
    if (typeof recordsFilterId !== "number") return null;
    const individualManagerId = recordsFilterId;

    const ownMatchups = filteredMatchups.filter((r) => r.manager_id === individualManagerId);
    const topScores = [...ownMatchups].sort((a, b) => b.score - a.score).slice(0, 3);
    const lowScores = [...ownMatchups].sort((a, b) => a.score - b.score).slice(0, 3);

    const pairMap = new Map<string, Matchup[]>();
    filteredMatchups.forEach((r) => {
      const key = [r.year, r.time_of_season, r.week, Math.min(r.manager_id, r.opponent_manager_id), Math.max(r.manager_id, r.opponent_manager_id)].join("-");
      if (!pairMap.has(key)) pairMap.set(key, []);
      pairMap.get(key)!.push(r);
    });
    const winMargins: { year: number; opponent: number; margin: number }[] = [];
    pairMap.forEach((pair) => {
      if (pair.length < 2) return;
      const [a, b] = pair;
      const mine = a.manager_id === individualManagerId ? a : b.manager_id === individualManagerId ? b : null;
      if (!mine || !mine.win) return;
      const opp = mine === a ? b : a;
      winMargins.push({ year: mine.year, opponent: opp.manager_id, margin: Math.abs(Number(mine.score) - Number(opp.score)) });
    });
    winMargins.sort((a, b) => b.margin - a.margin);
    const topMargins = winMargins.slice(0, 3);

    const seasonMap = new Map<number, { year: number; w: number; l: number; pf: number }>();
    ownMatchups.forEach((r) => {
      if (!seasonMap.has(r.year)) seasonMap.set(r.year, { year: r.year, w: 0, l: 0, pf: 0 });
      const s = seasonMap.get(r.year)!;
      if (r.win) s.w += 1;
      else s.l += 1;
      s.pf += Number(r.score ?? 0);
    });
    const seasonRows = Array.from(seasonMap.values());
    const topWinsSeasons = [...seasonRows].sort((a, b) => b.w - a.w || b.pf - a.pf).slice(0, 3);
    const topPointsSeasons = [...seasonRows].sort((a, b) => b.pf - a.pf).slice(0, 3);

    return { topScores, lowScores, topMargins, topWinsSeasons, topPointsSeasons };
  }, [filteredMatchups, recordsFilterId]);

  // Normalizes League Records (all managers) and Individual Records (one manager) into
  // the same {value, detail}[] shape the record cards render, so the JSX below doesn't
  // need to branch per-category.
  const displayRecords = useMemo(() => {
    if (recordsFilterId === "all") {
      return {
        topScores: leagueRecords.topScores.map((g) => ({
          value: Number(g.score).toFixed(1),
          detail: `${managerName.get(g.manager_id)} \u00b7 ${g.year}`,
        })),
        lowScores: leagueRecords.lowScores.map((g) => ({
          value: Number(g.score).toFixed(1),
          detail: `${managerName.get(g.manager_id)} \u00b7 ${g.year}`,
        })),
        topMargins: leagueRecords.topMargins.map((m) => ({
          value: `${m.margin.toFixed(1)} pts`,
          detail: `${managerName.get(m.winner)} def. ${managerName.get(m.loser)} \u00b7 ${m.year}`,
        })),
        topWinsSeasons: leagueRecords.topWinsSeasons.map((s) => ({
          value: `${s.w}-${s.l}`,
          detail: `${managerName.get(s.manager_id)} \u00b7 ${s.year}`,
        })),
        topPointsSeasons: leagueRecords.topPointsSeasons.map((s) => ({
          value: Number(s.pf).toFixed(1),
          detail: `${managerName.get(s.manager_id)} \u00b7 ${s.year}`,
        })),
      };
    }
    if (!individualRecords) return null;
    return {
      topScores: individualRecords.topScores.map((g) => ({
        value: Number(g.score).toFixed(1),
        detail: `${g.year} \u00b7 vs ${managerName.get(g.opponent_manager_id)}`,
      })),
      lowScores: individualRecords.lowScores.map((g) => ({
        value: Number(g.score).toFixed(1),
        detail: `${g.year} \u00b7 vs ${managerName.get(g.opponent_manager_id)}`,
      })),
      topMargins: individualRecords.topMargins.map((m) => ({
        value: `${m.margin.toFixed(1)} pts`,
        detail: `def. ${managerName.get(m.opponent)} \u00b7 ${m.year}`,
      })),
      topWinsSeasons: individualRecords.topWinsSeasons.map((s) => ({
        value: `${s.w}-${s.l}`,
        detail: `${s.year}`,
      })),
      topPointsSeasons: individualRecords.topPointsSeasons.map((s) => ({
        value: Number(s.pf).toFixed(1),
        detail: `${s.year}`,
      })),
    };
  }, [recordsFilterId, leagueRecords, individualRecords, managerName]);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Ten seasons of receipts</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">LEAGUE HISTORY</h1>
        </div>
      </section>

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
          <section className="max-w-6xl mx-auto px-5 py-14">
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl text-gravy chalk-shadow">ALL-TIME RECORDS</h2>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: `${900 + allPlaces.length * 90}px` }}>
                <thead>
                  <tr className="font-mono uppercase text-[11px] text-gravy/70 border-b border-biscuit bg-biscuit/30">
                    <th className="text-left pl-4 py-2 font-semibold whitespace-nowrap">Manager</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">Record</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">Win%</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">PPG</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">Years</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">Titles</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">Reg. Season Titles</th>
                    <th className="text-center py-2 font-semibold whitespace-nowrap">Playoffs</th>
                    {allPlaces.map((place) => (
                      <th key={place} className="text-center py-2 font-semibold whitespace-nowrap">{place}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {careerTable.map((r, i) => (
                    <tr key={i} className={`border-b border-biscuit/60 last:border-0 ${r.titles > 0 ? "bg-carolina/10" : ""}`}>
                      <td className="pl-4 py-2 font-semibold text-coffee align-top whitespace-nowrap">{r.name}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.w}-{r.l}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{(r.winPct * 100).toFixed(1)}%</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.ppg.toFixed(1)}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.seasonsPlayed}</td>
                      <td className="text-center py-2 font-mono text-carolina font-bold align-top whitespace-nowrap">{r.titles > 0 ? r.titles : "\u2014"}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.regSeasonTitles > 0 ? r.regSeasonTitles : "\u2014"}</td>
                      <td className="text-center py-2 font-mono align-top whitespace-nowrap">{r.playoffApps} / {r.seasonsPlayed}</td>
                      {allPlaces.map((place) => (
                        <td key={place} className="text-center py-2 font-mono text-xs text-gravy/80 align-top whitespace-nowrap">
                          {formatYears(r.places?.get(place))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="max-w-5xl mx-auto px-5 pb-14">
            <div className="text-center mb-8">
              <h2 className="font-display text-4xl text-gravy chalk-shadow">LEAGUE RECORDS</h2>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 justify-center mb-8">
              <button
                onClick={() => setRecordsFilterId("all")}
                className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                  recordsFilterId === "all" ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
                }`}
              >
                All
              </button>
              {managers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setRecordsFilterId(m.id)}
                  className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                    m.id === recordsFilterId ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
            {displayRecords && (
              <div className="grid sm:grid-cols-2 gap-5">
                <RecordCard title="Highest Single Score" entries={displayRecords.topScores} />
                <RecordCard title="Lowest Single Score" entries={displayRecords.lowScores} />
                <RecordCard title="Largest Win Margin" entries={displayRecords.topMargins} />
                <RecordCard title="Most Wins, Single Season" entries={displayRecords.topWinsSeasons} />
                <RecordCard title="Most Points, Single Season" entries={displayRecords.topPointsSeasons} />
              </div>
            )}
          </section>

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

function RecordCard({ title, entries }: { title: string; entries: { value: string; detail: string }[] }) {
  return (
    <div className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
      <div className="px-4 py-2 bg-gravy text-cream font-mono text-xs font-bold uppercase">{title}</div>
      <div className="px-4 py-3 space-y-2">
        {entries.length === 0 && <div className="font-mono text-xs text-gravy/60">\u2014</div>}
        {entries.map((e, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-burnt font-bold w-4">{i + 1}.</span>
            <span className="font-display text-xl text-burnt">{e.value}</span>
            <span className="font-mono text-xs text-gravy/60">{e.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
