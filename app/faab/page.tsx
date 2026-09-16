import { supabase } from "@/lib/supabase";
import FaabTable from "./FaabTable";

export const revalidate = 300;

// Pages through a Supabase query in chunks so results are never silently
// truncated by the project's "Max Rows" API setting.
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
  const { data } = await supabase.from("seasons").select("year").order("year", { ascending: false });
  return (data ?? []).map((s: any) => s.year as number);
}

async function getYearClaims(year: number) {
  const { data } = await supabase
    .from("faab_claims")
    .select(
      "id, player_name, nfl_team, position, status, winning_bid, award_date, awarded_manager_id, managers(name)"
    )
    .eq("year", year)
    .order("id", { ascending: true });

  const claims = (data ?? []).map((c: any) => ({
    id: c.id,
    player_name: c.player_name,
    nfl_team: c.nfl_team,
    position: c.position,
    status: c.status,
    winning_bid: c.winning_bid,
    award_date: c.award_date,
    manager_id: c.awarded_manager_id,
    manager_name: c.managers?.name ?? "Unknown",
  }));

  const claimIds = claims.map((c) => c.id);
  let offersByClaimId = new Map<number, { manager_id: number; manager_name: string; amount: number; reason: string }[]>();

  if (claimIds.length > 0) {
    const offers = await fetchAllRows<any>((from, to) =>
      supabase
        .from("faab_offers")
        .select("claim_id, manager_id, amount, reason, managers(name)")
        .in("claim_id", claimIds)
        .range(from, to)
    );
    offers.forEach((o: any) => {
      const list = offersByClaimId.get(o.claim_id) ?? [];
      list.push({
        manager_id: o.manager_id,
        manager_name: o.managers?.name ?? "Unknown",
        amount: o.amount,
        reason: o.reason,
      });
      offersByClaimId.set(o.claim_id, list);
    });
  }

  return claims.map((c) => ({
    ...c,
    offers: (offersByClaimId.get(c.id) ?? []).sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
  }));
}

async function getYearStats(year: number) {
  const { data } = await supabase
    .from("faab_claims")
    .select("awarded_manager_id, winning_bid, managers(name)")
    .eq("year", year);

  const byManager = new Map<number, { name: string; total: number; count: number }>();
  (data ?? []).forEach((r: any) => {
    const cur = byManager.get(r.awarded_manager_id) ?? { name: r.managers?.name ?? "Unknown", total: 0, count: 0 };
    cur.total += Number(r.winning_bid ?? 0);
    cur.count += 1;
    byManager.set(r.awarded_manager_id, cur);
  });

  return Array.from(byManager.values()).sort((a, b) => b.total - a.total);
}

export default async function FaabPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const seasons = await getSeasons();
  const faabSeasons = seasons.filter((y) => y >= 2016 && y <= 2025);
  const latestYear = faabSeasons[0] ?? seasons[0];
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;

  const [claims, stats] = await Promise.all([getYearClaims(year), getYearStats(year)]);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Waiver wire warfare</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">FAAB HISTORY</h1>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {faabSeasons.map((y) => (
            <a
              key={y}
              href={`/faab?year=${y}`}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                y === year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {y}
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-gravy chalk-shadow">{year} FAAB SPENDING</h2>
          <div className="menu-divider w-40 mx-auto mt-3" />
        </div>

        {stats.length > 0 && (
          <div className="max-w-4xl mx-auto mb-12 grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.name}
                className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex items-center justify-between"
              >
                <span className="font-semibold text-coffee">{s.name}</span>
                <span className="font-mono text-sm text-right">
                  <span className="font-bold text-burnt">${s.total}</span>
                  <span className="text-gravy/50 ml-1.5">/ {s.count} {s.count === 1 ? "claim" : "claims"}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {claims.length === 0 && (
          <p className="text-center font-body text-gravy/70">No FAAB claims found for {year}.</p>
        )}

        {claims.length > 0 && <FaabTable claims={claims} year={year} />}
      </section>
    </div>
  );
}
