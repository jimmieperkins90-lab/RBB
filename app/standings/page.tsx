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

  const [{ rows: standings, seasonComplete }, playoffOdds, seasonGames] = await Promise.all([
    getStandings(year),
    getPlayoffOdds(year),
    getSeasonGames(year),
  ]);

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
          <SeasonStatsPanel allGameStats={allGameStats} regularSeasonTotals={regularSeasonTotals} />
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
          />
        )}
      </section>
    </div>
  );
}
