import { supabase } from "@/lib/supabase";
import StandingsTable from "./StandingsTable";
import SeasonStatsPanel, {
  ScoreStat,
  MarginStat,
  StreakStat,
  TotalStat,
} from "./SeasonStatsPanel";

export const revalidate = 300;

function ordinalToNumber(v: string | null): number {
  if (!v) return 999;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 999 : n;
}

// Regular -> Playoff -> Toilet Bowl, ascending week within each. Matches the
// chronological ordering already used in StandingsTable's game-log expansion.
function seasonOrder(t: string): number {
  return t === "Regular" ? 0 : t === "Playoff" ? 1 : 2;
}

// Pages through a Supabase query in chunks so results are never silently
// truncated by the project's "Max Rows" API setting — needed here because a
// full season of lineups (all managers, all weeks, all roster spots) can
// easily exceed 1000 rows.
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

// --- Optimal-lineup solver (same algorithm used in StandingsTable.tsx for the
// per-manager week-by-week expansion — duplicated here so this file can
// compute season totals for every manager server-side without depending on a
// "use client" module). See StandingsTable.tsx for full explanation.

const BIG = 10000;
const PENALTY = 1000000;

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
        row.push(BIG);
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

async function getSeasons() {
  const { data } = await supabase.from("seasons").select("year, num_teams").order("year", { ascending: false });
  return data ?? [];
}

async function getStandings(year: number) {
  const { data: teamSeasons } = await supabase
    .from("team_seasons")
    .select("manager_id, division, final_place, regular_season_place, division_place, made_finals, managers(name)")
    .eq("year", year);

  const { data: matchups } = await supabase
    .from("matchups")
    .select("manager_id, win, score, opp_score, game_played")
    .eq("year", year)
    .eq("game_played", true);

  const record = new Map<number, { w: number; l: number; pf: number; pa: number }>();
  (matchups ?? []).forEach((m: any) => {
    const cur = record.get(m.manager_id) ?? { w: 0, l: 0, pf: 0, pa: 0 };
    if (m.win) cur.w += 1;
    else cur.l += 1;
    cur.pf += Number(m.score ?? 0);
    cur.pa += Number(m.opp_score ?? 0);
    record.set(m.manager_id, cur);
  });

  const rows = (teamSeasons ?? []).map((t: any) => ({
    ...t,
    managerName: t.managers?.name ?? "Unknown",
    record: record.get(t.manager_id) ?? { w: 0, l: 0, pf: 0, pa: 0 },
  }));

  // Season is "complete" once every team has a recorded final finish. Until then,
  // the Finish column is replaced with live Playoff Odds (see getPlayoffOdds below).
  const seasonComplete = rows.length > 0 && rows.every((r) => r.final_place);

  rows.sort((a, b) => {
    if (seasonComplete) {
      const fa = ordinalToNumber(a.final_place);
      const fb = ordinalToNumber(b.final_place);
      if (fa !== fb) return fa - fb;
    }
    if (b.record.w !== a.record.w) return b.record.w - a.record.w;
    return b.record.pf - a.record.pf;
  });

  return { rows, seasonComplete };
}

// Empty (or missing entirely) until playoff odds have actually been computed and
// loaded for this season — the table just falls back to "—" until then.
async function getPlayoffOdds(year: number) {
  const { data } = await supabase
    .from("playoff_odds")
    .select("manager_id, playoff_pct, as_of_week")
    .eq("year", year);
  return data ?? [];
}

type PossiblePointsRow = {
  manager_id: number;
  totalActual: number;
  totalPossible: number;
  pctPlayed: number;
  totalLeftOnBench: number;
  avgLeftOnBench: number;
};

type SeasonPctStat = {
  value: number;
  managerName: string;
  actual: number;
  possible: number;
};

// Season-long "coach's efficiency" totals per manager: actual points scored vs.
// the optimal lineup possible each week (IR excluded from the possible pool),
// summed across every played week including playoffs/TB — same scope as the
// per-manager expansion in StandingsTable.tsx, just aggregated for everyone
// up front so it can show in the main table. Also identifies the manager with
// the best/worst season-long % of max, for the Season Stats panel.
async function getPossiblePointsStats(
  year: number
): Promise<{ results: PossiblePointsRow[]; highestSeasonPct: SeasonPctStat | null; lowestSeasonPct: SeasonPctStat | null }> {
  const [lineups, managersRes] = await Promise.all([
    fetchAllRows<any>((from, to) =>
      supabase
        .from("lineups")
        .select("manager_id, week, lineup_pos, player_position, points")
        .eq("year", year)
        .neq("lineup_pos", "IR")
        .range(from, to)
    ),
    supabase.from("managers").select("id, name"),
  ]);

  const managerName = new Map((managersRes.data ?? []).map((m: any) => [m.id as number, m.name as string]));

  const byManagerWeek = new Map<number, Map<number, { lineup_pos: string; player_position: string | null; points: number }[]>>();
  lineups.forEach((r: any) => {
    const byWeek = byManagerWeek.get(r.manager_id) ?? new Map();
    const list = byWeek.get(r.week) ?? [];
    list.push({ lineup_pos: r.lineup_pos, player_position: r.player_position, points: Number(r.points ?? 0) });
    byWeek.set(r.week, list);
    byManagerWeek.set(r.manager_id, byWeek);
  });

  const results: PossiblePointsRow[] = [];

  byManagerWeek.forEach((byWeek, managerId) => {
    let totalActual = 0;
    let totalPossible = 0;
    let games = 0;
    byWeek.forEach((weekRows) => {
      const actual = weekRows.filter((r) => r.lineup_pos !== "BN").reduce((sum, r) => sum + r.points, 0);
      const slotTypes = weekRows.filter((r) => r.lineup_pos !== "BN").map((r) => canonicalPosition(r.lineup_pos));
      const pool = weekRows.map((r) => ({ points: r.points, eligible: parseEligiblePositions(r.player_position) }));
      const possible = computeOptimalPoints(slotTypes, pool);
      totalActual += actual;
      totalPossible += possible;
      games += 1;
    });
    const totalLeftOnBench = totalPossible - totalActual;
    results.push({
      manager_id: managerId,
      totalActual,
      totalPossible,
      pctPlayed: totalPossible > 0 ? (totalActual / totalPossible) * 100 : 0,
      totalLeftOnBench,
      avgLeftOnBench: games > 0 ? totalLeftOnBench / games : 0,
    });
  });

  let highestSeasonPct: SeasonPctStat | null = null;
  let lowestSeasonPct: SeasonPctStat | null = null;
  results.forEach((r) => {
    if (r.totalPossible <= 0) return;
    const stat: SeasonPctStat = {
      value: r.pctPlayed,
      managerName: managerName.get(r.manager_id) ?? "Unknown",
      actual: r.totalActual,
      possible: r.totalPossible,
    };
    if (!highestSeasonPct || stat.value > highestSeasonPct.value) highestSeasonPct = stat;
    if (!lowestSeasonPct || stat.value < lowestSeasonPct.value) lowestSeasonPct = stat;
  });

  return { results, highestSeasonPct, lowestSeasonPct };
}

type SeasonGame = {
  manager_id: number;
  managerName: string;
  opponent_manager_id: number;
  opponentName: string;
  score: number;
  opp_score: number;
  win: boolean;
  week: number;
  time_of_season: string;
};

// Every played game this season, both perspectives (each manager gets their own
// row for a given game). Used to derive all of the season-stats panel categories.
async function getSeasonGames(year: number): Promise<SeasonGame[]> {
  const { data } = await supabase
    .from("matchups")
    .select(
      "manager_id, opponent_manager_id, score, opp_score, win, week, time_of_season, manager:manager_id(name), opponent:opponent_manager_id(name)"
    )
    .eq("year", year)
    .eq("game_played", true);

  return (data ?? []).map((r: any) => ({
    manager_id: r.manager_id as number,
    managerName: (r.manager?.name ?? "Unknown") as string,
    opponent_manager_id: r.opponent_manager_id as number,
    opponentName: (r.opponent?.name ?? "Unknown") as string,
    score: Number(r.score ?? 0),
    opp_score: Number(r.opp_score ?? 0),
    win: Boolean(r.win),
    week: r.week as number,
    time_of_season: r.time_of_season as string,
  }));
}

// Highest/lowest single-team score, biggest blowout, closest game, and longest
// win/loss streaks — computed across ALL played games (regular + playoff + TB).
function computeAllGameStats(games: SeasonGame[]) {
  let highest: ScoreStat | null = null;
  let lowest: ScoreStat | null = null;

  games.forEach((g) => {
    if (!highest || g.score > highest.value) {
      highest = {
        value: g.score,
        managerName: g.managerName,
        opponentName: g.opponentName,
        week: g.week,
        time_of_season: g.time_of_season,
      };
    }
    if (!lowest || g.score < lowest.value) {
      lowest = {
        value: g.score,
        managerName: g.managerName,
        opponentName: g.opponentName,
        week: g.week,
        time_of_season: g.time_of_season,
      };
    }
  });

  // Each real game appears twice (once per team's perspective) — use the winner's
  // row only so blowout/closest each represent one game, not two.
  let blowout: MarginStat | null = null;
  let closest: MarginStat | null = null;

  games
    .filter((g) => g.win)
    .forEach((g) => {
      const margin = g.score - g.opp_score;
      const stat: MarginStat = {
        margin,
        winnerName: g.managerName,
        loserName: g.opponentName,
        winnerScore: g.score,
        loserScore: g.opp_score,
        week: g.week,
        time_of_season: g.time_of_season,
      };
      if (!blowout || margin > blowout.margin) blowout = stat;
      if (!closest || margin < closest.margin) closest = stat;
    });

  const byManager = new Map<number, SeasonGame[]>();
  games.forEach((g) => {
    const list = byManager.get(g.manager_id) ?? [];
    list.push(g);
    byManager.set(g.manager_id, list);
  });

  let longestWinStreak: StreakStat = { length: 0, managers: [] };
  let longestLossStreak: StreakStat = { length: 0, managers: [] };

  byManager.forEach((managerGames) => {
    const sorted = [...managerGames].sort(
      (a, b) => seasonOrder(a.time_of_season) - seasonOrder(b.time_of_season) || a.week - b.week
    );
    const name = sorted[0]?.managerName ?? "Unknown";
    let curWin = 0;
    let curLoss = 0;
    let maxWin = 0;
    let maxLoss = 0;
    sorted.forEach((g) => {
      if (g.win) {
        curWin += 1;
        curLoss = 0;
      } else {
        curLoss += 1;
        curWin = 0;
      }
      maxWin = Math.max(maxWin, curWin);
      maxLoss = Math.max(maxLoss, curLoss);
    });

    if (maxWin > longestWinStreak.length) {
      longestWinStreak = { length: maxWin, managers: [name] };
    } else if (maxWin === longestWinStreak.length && maxWin > 0) {
      longestWinStreak = { ...longestWinStreak, managers: [...longestWinStreak.managers, name] };
    }

    if (maxLoss > longestLossStreak.length) {
      longestLossStreak = { length: maxLoss, managers: [name] };
    } else if (maxLoss === longestLossStreak.length && maxLoss > 0) {
      longestLossStreak = { ...longestLossStreak, managers: [...longestLossStreak.managers, name] };
    }
  });

  return { highest, lowest, blowout, closest, longestWinStreak, longestLossStreak };
}

// Most total PF, most total PA, best/worst season-long margin — regular season
// games only, per the "these new ones are for regular season only" instruction.
function computeRegularSeasonTotals(games: SeasonGame[]) {
  const totals = new Map<number, { name: string; pf: number; pa: number }>();

  games
    .filter((g) => g.time_of_season === "Regular")
    .forEach((g) => {
      const cur = totals.get(g.manager_id) ?? { name: g.managerName, pf: 0, pa: 0 };
      cur.pf += g.score;
      cur.pa += g.opp_score;
      totals.set(g.manager_id, cur);
    });

  let mostPF: TotalStat | null = null;
  let mostPA: TotalStat | null = null;
  let bestMargin: TotalStat | null = null;
  let worstMargin: TotalStat | null = null;

  totals.forEach((t) => {
    const margin = t.pf - t.pa;
    if (!mostPF || t.pf > mostPF.value) mostPF = { value: t.pf, managerName: t.name };
    if (!mostPA || t.pa > mostPA.value) mostPA = { value: t.pa, managerName: t.name };
    if (!bestMargin || margin > bestMargin.value) bestMargin = { value: margin, managerName: t.name };
    if (!worstMargin || margin < worstMargin.value) worstMargin = { value: margin, managerName: t.name };
  });

  return { mostPF, mostPA, bestMargin, worstMargin };
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const seasons = await getSeasons();
  const latestYear = seasons[0]?.year ?? 2025;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;

  const [{ rows: standings, seasonComplete }, playoffOdds, seasonGames, possiblePoints] = await Promise.all([
    getStandings(year),
    getPlayoffOdds(year),
    getSeasonGames(year),
    getPossiblePointsStats(year),
  ]);
  const { results: possiblePointsStats, highestSeasonPct, lowestSeasonPct } = possiblePoints;

  const hasDivisions = standings.some((r) => r.division);
  const allGameStats = computeAllGameStats(seasonGames);
  const regularSeasonTotals = computeRegularSeasonTotals(seasonGames);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-16 md:py-20 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Open since 2016 &middot; Ten seasons and counting</p>
          <h1 className="font-display text-5xl md:text-7xl leading-none chalk-shadow">
            THE RISKY BISKIES
          </h1>
          <p className="mt-4 text-cream/70 max-w-xl mx-auto font-body">
            Standings, matchups, lineups, and draft history &mdash; served up like the daily special.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {seasons.map((s) => (
<a            
              key={s.year}
              href={`/standings?year=${s.year}`}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                s.year === year
                  ? "bg-burnt text-cream border-burnt"
                  : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {s.year}
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-gravy chalk-shadow">{year} STANDINGS</h2>
          <div className="menu-divider w-40 mx-auto mt-3" />
        </div>

        {seasonGames.length > 0 && (
          <SeasonStatsPanel
            allGameStats={allGameStats}
            regularSeasonTotals={regularSeasonTotals}
            highestSeasonPct={highestSeasonPct}
            lowestSeasonPct={lowestSeasonPct}
          />
        )}

        {standings.length === 0 && (
          <p className="text-center font-body text-gravy/70">No standings found for {year} yet.</p>
        )}

        {standings.length > 0 && (
          <StandingsTable
            standings={standings}
            year={year}
            hasDivisions={hasDivisions}
            seasonComplete={seasonComplete}
            playoffOdds={playoffOdds}
            possiblePointsStats={possiblePointsStats}
          />
        )}
      </section>
    </div>
  );
}
