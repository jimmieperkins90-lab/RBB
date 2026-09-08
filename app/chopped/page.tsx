import { supabase } from "@/lib/supabase";

export const revalidate = 300;

// First week eligible for a chop. Weeks before this don't count.
const CHOP_START_WEEK = 4;

async function getSeasons() {
  const { data } = await supabase.from("seasons").select("year").order("year", { ascending: false });
  return (data ?? []).map((s) => s.year as number);
}

type ChopEvent = {
  week: number;
  managerId: number;
  name: string;
  score: number;
  tieBroken: boolean;
};

async function getChoppedData(year: number) {
  // Full manager pool for the year, from the schedule (works even pre-season).
  const { data: allRows } = await supabase
    .from("matchups")
    .select("manager_id, managers:manager_id(name)")
    .eq("year", year)
    .eq("time_of_season", "Regular");

  const managerNames = new Map<number, string>();
  (allRows ?? []).forEach((r: any) => {
    managerNames.set(r.manager_id, r.managers?.name ?? "Unknown");
  });

  // Played weeks only, with scores.
  const { data: playedRows } = await supabase
    .from("matchups")
    .select("manager_id, week, score")
    .eq("year", year)
    .eq("time_of_season", "Regular")
    .eq("game_played", true)
    .not("score", "is", null)
    .order("week", { ascending: true });

  // week -> managerId -> score
  const weekScores = new Map<number, Map<number, number>>();
  (playedRows ?? []).forEach((r: any) => {
    if (!weekScores.has(r.week)) weekScores.set(r.week, new Map());
    weekScores.get(r.week)!.set(r.manager_id, Number(r.score));
  });

  const allManagerIds = Array.from(managerNames.keys());
  let remaining = new Set<number>(allManagerIds);
  const cumulative = new Map<number, number>();
  allManagerIds.forEach((id) => cumulative.set(id, 0));

  const events: ChopEvent[] = [];
  const maxWeek = Math.max(0, ...Array.from(weekScores.keys()));

  for (let week = 1; week <= maxWeek && remaining.size > 1; week++) {
    const scoresThisWeek = weekScores.get(week);
    if (!scoresThisWeek) break; // week not fully loaded yet

    // require every remaining manager to have a played score this week
    const allPlayed = Array.from(remaining).every((id) => scoresThisWeek.has(id));
    if (!allPlayed) break;

    // update cumulative totals for remaining managers
    remaining.forEach((id) => {
      cumulative.set(id, (cumulative.get(id) ?? 0) + (scoresThisWeek.get(id) ?? 0));
    });

    if (week < CHOP_START_WEEK) continue; // pool hasn't opened yet

    const minScore = Math.min(...Array.from(remaining).map((id) => scoresThisWeek.get(id)!));
    let candidates = Array.from(remaining).filter((id) => scoresThisWeek.get(id) === minScore);

    let tieBroken = false;
    if (candidates.length > 1) {
      tieBroken = true;
      const minTotal = Math.min(...candidates.map((id) => cumulative.get(id)!));
      candidates = candidates.filter((id) => cumulative.get(id) === minTotal);
      // final fallback if still tied: lowest manager_id, for determinism
      candidates.sort((a, b) => a - b);
    }

    const choppedId = candidates[0];
    events.push({
      week,
      managerId: choppedId,
      name: managerNames.get(choppedId) ?? "Unknown",
      score: minScore,
      tieBroken,
    });
    remaining.delete(choppedId);
  }

  const survivors = Array.from(remaining)
    .map((id) => managerNames.get(id) ?? "Unknown")
    .sort((a, b) => a.localeCompare(b));

  return {
    events,
    survivors,
    poolStarted: maxWeek >= CHOP_START_WEEK,
    winner: remaining.size === 1 ? managerNames.get(Array.from(remaining)[0]) : null,
  };
}

export default async function ChoppedPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const seasons = await getSeasons();
  const latestYear = seasons[0] ?? 2025;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;
  const { events, survivors, poolStarted, winner } = await getChoppedData(year);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">
            Lowest score each week gets the knife
          </p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">{year} CHOPPED</h1>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {seasons.map((y) => (
            <a
              key={y}
              href={`/chopped?year=${y}`}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                y === year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {y}
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-5 py-14 space-y-10">
        {!poolStarted && (
          <p className="text-center font-body text-gravy/70">
            The chopping block opens in Week {CHOP_START_WEEK}. Check back once the season gets rolling.
          </p>
        )}

        {winner && (
          <div className="text-center">
            <span className="inline-block px-6 py-3 bg-carolina text-white text-xl font-display uppercase rounded-full chalk-shadow">
              🏆 {winner} survives the pool!
            </span>
          </div>
        )}

        {poolStarted && events.length > 0 && (
          <div>
            <h3 className="font-display text-2xl text-gravy mb-4 text-center tracking-wide chalk-shadow">
              The Chopping Block
            </h3>
            <div className="space-y-3">
              {events.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gravy/50 uppercase w-16">Week {e.week}</span>
                    <span className="font-display text-lg text-gravy">{e.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gravy/60">{e.score.toFixed(1)} pts</span>
                    <span className="px-3 py-1 rounded-full bg-burnt text-cream font-mono text-xs font-bold uppercase">
                      🔪 Chopped
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {events.some((e) => e.tieBroken) && (
              <p className="text-center font-mono text-xs text-gravy/40 mt-3">
                Ties broken by lower season-long point total.
              </p>
            )}
          </div>
        )}

        {survivors.length > 1 && (
          <div>
            <h3 className="font-display text-2xl text-gravy mb-4 text-center tracking-wide chalk-shadow">
              Still In The Pool
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {survivors.map((name) => (
                <span
                  key={name}
                  className="px-4 py-2 bg-goldenrod text-coffee font-mono text-sm font-bold rounded-full"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
