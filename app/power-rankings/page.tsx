import { supabase } from "@/lib/supabase";

export const revalidate = 300;

// Pages through a Supabase query in chunks so results are never silently
// truncated by the project's "Max Rows" API setting, regardless of how
// many seasons/weeks a query spans.
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

async function getSeasons() {
  const rows = await fetchAllRows<{ year: number }>((from, to) =>
    supabase.from("power_rankings").select("year").range(from, to)
  );
  return Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a);
}

async function getWeeks(year: number) {
  const rows = await fetchAllRows<{ week: number }>((from, to) =>
    supabase.from("power_rankings").select("week").eq("year", year).range(from, to)
  );
  return Array.from(new Set(rows.map((r) => r.week))).sort((a, b) => a - b);
}

async function getRankings(year: number, week: number) {
  const { data } = await supabase
    .from("power_rankings")
    .select("rank, team_name, record, streak, prev_rank, notes, managers(name)")
    .eq("year", year)
    .eq("week", week)
    .order("rank", { ascending: true });
  return (data ?? []) as any[];
}

export default async function PowerRankingsPage({
  searchParams,
}: {
  searchParams: { year?: string; week?: string };
}) {
  const seasons = await getSeasons();
  const latestYear = seasons[0] ?? 2025;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;

  const weeks = await getWeeks(year);
  const latestWeek = weeks[weeks.length - 1] ?? 1;
  const week = searchParams.week ? parseInt(searchParams.week, 10) : latestWeek;

  const rankings = await getRankings(year, week);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">The word on the street</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">POWER RANKINGS</h1>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {seasons.map((y) => (
            <a
              key={y}
              href={`/power-rankings?year=${y}`}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                y === year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {y}
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 mt-4">
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          {weeks.map((w) => (
            <a
              key={w}
              href={`/power-rankings?year=${year}&week=${w}`}
              className={`w-9 h-9 flex items-center justify-center rounded-full font-mono text-xs font-bold border-2 transition-colors ${
                w === week ? "bg-gravy text-cream border-gravy" : "bg-transparent text-gravy border-biscuit hover:border-gravy"
              }`}
            >
              {w}
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-gravy chalk-shadow">
            WEEK {week} &middot; {year}
          </h2>
          <div className="menu-divider w-40 mx-auto mt-3" />
        </div>

        {rankings.length === 0 && (
          <p className="text-center font-body text-gravy/70">No power rankings found for this week.</p>
        )}

        <div className="space-y-4">
          {rankings.map((r, i) => {
            const change = r.prev_rank != null ? r.prev_rank - r.rank : null;
            return (
              <div key={i} className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
                <div className="px-4 py-3 bg-burnt text-cream flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-2xl">#{r.rank}</span>
                    <div>
                      <div className="font-display text-2xl leading-tight">{r.team_name}</div>
                      <div className="font-mono text-sm text-cream/70">{r.managers?.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold">{r.record}</div>
                    <div className="flex items-center gap-2 justify-end mt-1">
                      {r.streak && (
                        <span
                          className={`text-sm font-mono font-bold px-2 py-0.5 rounded ${
                            r.streak.startsWith("W") ? "bg-green-700/30 text-green-100" : "bg-red-900/30 text-red-100"
                          }`}
                        >
                          {r.streak}
                        </span>
                      )}
                      {change !== null && (
                        <span
                          className={`text-sm font-mono font-bold ${
                            change > 0 ? "text-green-300" : change < 0 ? "text-red-300" : "text-cream/50"
                          }`}
                        >
                          {change > 0 ? `\u2191${change}` : change < 0 ? `\u2193${Math.abs(change)}` : "\u2192"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {r.notes && (
                  <div className="px-4 py-3 font-body text-sm text-coffee/90 leading-relaxed">
                    {r.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
