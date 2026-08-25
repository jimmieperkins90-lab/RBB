import { supabase } from "@/lib/supabase";
import MatchupsSections from ".MatchupsSections";

export const revalidate = 300;

async function getSeasons() {
  const { data } = await supabase.from("seasons").select("year").order("year", { ascending: false });
  return (data ?? []).map((s) => s.year as number);
}

async function getWeeks(year: number) {
  const { data } = await supabase
    .from("matchups")
    .select("week, time_of_season")
    .eq("year", year)
    .eq("game_played", true);
  const weeks = Array.from(new Set((data ?? []).map((r) => r.week as number))).sort((a, b) => a - b);
  const hasPlayoffWeek = (data ?? []).some((r: any) => r.time_of_season === "Playoff" || r.time_of_season === "TB");
  return { weeks, hasPlayoffWeek };
}

async function getMatchups(year: number, week: number) {
  const { data } = await supabase
    .from("matchups")
    .select(
      "manager_id, opponent_manager_id, score, opp_score, proj_score, opp_proj_score, win, favorite_underdog, time_of_season, round_game, seed, managers:manager_id(name), opponent:opponent_manager_id(name)"
    )
    .eq("year", year)
    .eq("week", week)
    .eq("game_played", true);

  // Dedupe: each game appears twice (once per team perspective).
  const seen = new Set<string>();
  const games: any[] = [];
  (data ?? []).forEach((r: any) => {
    const a = r.manager_id;
    const b = r.opponent_manager_id;
    const key = [Math.min(a, b), Math.max(a, b)].join("-");
    if (seen.has(key)) return;
    seen.add(key);
    const base = {
      favUnderdog: r.favorite_underdog,
      timeOfSeason: r.time_of_season,
      roundGame: r.round_game,
    };
    if (a < b) {
      games.push({
        ...base,
        homeId: a,
        homeName: r.managers?.name ?? "Unknown",
        homeScore: r.score,
        homeProj: r.proj_score,
        homeWin: r.win,
        awayId: b,
        awayName: r.opponent?.name ?? "Unknown",
        awayScore: r.opp_score,
        awayProj: r.opp_proj_score,
      });
    } else {
      games.push({
        ...base,
        homeId: b,
        homeName: r.opponent?.name ?? "Unknown",
        homeScore: r.opp_score,
        homeProj: r.opp_proj_score,
        homeWin: !r.win,
        awayId: a,
        awayName: r.managers?.name ?? "Unknown",
        awayScore: r.score,
        awayProj: r.proj_score,
      });
    }
  });

  games.sort((a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore));
  return games;
}

export default async function MatchupsPage({
  searchParams,
}: {
  searchParams: { year?: string; week?: string };
}) {
  const seasons = await getSeasons();
  const latestYear = seasons[0] ?? 2025;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;

  const { weeks, hasPlayoffWeek } = await getWeeks(year);
  const latestWeek = weeks[weeks.length - 1] ?? 1;
  const week = searchParams.week ? parseInt(searchParams.week, 10) : latestWeek;

  const games = await getMatchups(year, week);
  const regularGames = games.filter((g) => g.timeOfSeason === "Regular");
  const playoffGames = games.filter((g) => g.timeOfSeason === "Playoff");
  const tbGames = games.filter((g) => g.timeOfSeason === "TB");

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Box scores, served hot</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">MATCHUPS</h1>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {seasons.map((y) => (
            <a
              key={y}
              href={`/matchups?year=${y}`}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                y === year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {y}
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 mt-4 flex flex-wrap items-center justify-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          {weeks.map((w) => (
            <a
              key={w}
              href={`/matchups?year=${year}&week=${w}`}
              className={`w-9 h-9 flex items-center justify-center rounded-full font-mono text-xs font-bold border-2 transition-colors ${
                w === week ? "bg-gravy text-cream border-gravy" : "bg-transparent text-gravy border-biscuit hover:border-gravy"
              }`}
            >
              {w}
            </a>
          ))}
        </div>
        {hasPlayoffWeek && (
          <a
            href={`/matchups/bracket?year=${year}`}
            className="px-4 py-2 rounded-full bg-coffee text-cream font-mono text-xs font-bold uppercase tracking-wide hover:bg-gravy transition-colors"
          >
            View Bracket &rarr;
          </a>
        )}
      </section>

      <section className="max-w-4xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-gravy chalk-shadow">
            WEEK {week} &middot; {year}
          </h2>
          <div className="menu-divider w-40 mx-auto mt-3" />
        </div>

        {games.length === 0 && (
          <p className="text-center font-body text-gravy/70">No games found for this week.</p>
        )}

        <MatchupsSections regularGames={regularGames} playoffGames={playoffGames} tbGames={tbGames} year={year} week={week} />
      </section>
    </div>
  );
}
