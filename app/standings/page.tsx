import { supabase } from "@/lib/supabase";

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
    // Fall back to record for seasons without a final placement yet (in progress)
    if (b.record.w !== a.record.w) return b.record.w - a.record.w;
    return b.record.pf - a.record.pf;
  });

  return rows;
}

export default async function HomePage({
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
      {/* Hero */}
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

      {/* Season selector */}
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

      {/* Standings menu boards */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-gravy chalk-shadow">{year} STANDINGS</h2>
          <div className="menu-divider w-40 mx-auto mt-3" />
        </div>

        {standings.length === 0 && (
          <p className="text-center font-body text-gravy/70">No standings found for {year} yet.</p>
        )}

        {standings.length > 0 && (
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
                  <tr
                    key={t.manager_id}
                    className={`border-b border-biscuit/60 last:border-0 ${
                      t.made_finals ? "bg-goldenrod/10" : ""
                    }`}
                  >
                    <td className="text-center py-2 font-mono text-gravy/60">{i + 1}</td>
                    <td className="py-2 font-semibold text-coffee">
                      {t.managerName}
                      {t.made_finals && <span className="ml-2 text-[10px] text-burnt font-mono">FINALS</span>}
                    </td>
                    {hasDivisions && (
                      <td className="py-2 font-mono text-xs text-gravy/70">{t.division ?? "\u2014"}</td>
                    )}
                    <td className="text-center py-2 font-mono">{t.record.w}-{t.record.l}</td>
                    <td className="text-center py-2 font-mono">{t.record.pf.toFixed(1)}</td>
                    <td className="text-center pr-4 py-2 font-mono text-burnt font-bold">{t.final_place ?? "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
