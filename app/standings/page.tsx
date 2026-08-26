import { supabase } from "@/lib/supabase";
import StandingsTable from "./StandingsTable";

export const revalidate = 300;

function ordinalToNumber(v: string | null): number {
  if (!v) return 999;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 999 : n;
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
    .select("manager_id, win, score, game_played")
    .eq("year", year)
    .eq("game_played", true);

  const record = new Map<number, { w: number; l: number; pf: number }>();
  (matchups ?? []).forEach((m: any) => {
    const cur = record.get(m.manager_id) ?? { w: 0, l: 0, pf: 0 };
    if (m.win) cur.w += 1;
    else cur.l += 1;
    cur.pf += Number(m.score ?? 0);
    record.set(m.manager_id, cur);
  });

  const rows = (teamSeasons ?? []).map((t: any) => ({
    ...t,
    managerName: t.managers?.name ?? "Unknown",
    record: record.get(t.manager_id) ?? { w: 0, l: 0, pf: 0 },
  }));

  const hasFinal = rows.some((r) => r.final_place);
  rows.sort((a, b) => {
    if (hasFinal) {
      const fa = ordinalToNumber(a.final_place);
      const fb = ordinalToNumber(b.final_place);
      if (fa !== fb) return fa - fb;
    }
    if (b.record.w !== a.record.w) return b.record.w - a.record.w;
    return b.record.pf - a.record.pf;
  });

  return rows;
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const seasons = await getSeasons();
  const latestYear = seasons[0]?.year ?? 2025;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;
  const standings = await getStandings(year);
  const hasDivisions = standings.some((r) => r.division);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-16 md:py-20 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Open since 2016 &middot; Ten seasons and counting</p>
          <h1 className="font-display text-5xl md:text-7xl leading-none chalk-shadow">
            THE R.B.B. LEAGUE
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

        {standings.length === 0 && (
          <p className="text-center font-body text-gravy/70">No standings found for {year} yet.</p>
        )}

        {standings.length > 0 && (
          <StandingsTable standings={standings} year={year} hasDivisions={hasDivisions} />
        )}
      </section>
    </div>
  );
}
