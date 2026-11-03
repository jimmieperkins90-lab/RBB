// "What If?" scenarios for the next week's games. Self-contained: fetches its own data and renders
// nothing unless playoff_scenarios rows exist for the current odds week.
// To remove: delete this file + WhatIfPanel.tsx, remove the <WhatIf /> line in page.tsx, and
// `drop table playoff_scenarios;` in Supabase.
import { supabase } from "@/lib/supabase";
import WhatIfPanel, { Scenario, Base } from "./WhatIfPanel";

export default async function WhatIf({ year }: { year: number }) {
  const [scenRes, oddsRes, mgrRes] = await Promise.all([
    supabase
      .from("playoff_scenarios")
      .select("as_of_week, game_week, winner_id, loser_id, outcome_pct, manager_id, playoff_pct, bye_pct")
      .eq("year", year),
    supabase.from("playoff_odds").select("manager_id, playoff_pct, bye_pct, as_of_week").eq("year", year),
    supabase.from("managers").select("id, name"),
  ]);
  const scen = (scenRes.data ?? []) as any[];
  const odds = (oddsRes.data ?? []) as any[];
  if (scen.length === 0 || odds.length === 0) return null;
  const asOf = odds[0].as_of_week;
  const rows = scen.filter((s) => s.as_of_week === asOf);
  if (rows.length === 0) return null;

  const names: Record<number, string> = {};
  (mgrRes.data ?? []).forEach((m: any) => (names[m.id] = m.name));
  const base: Base = {};
  odds.forEach((o) => (base[o.manager_id] = { playoff: Number(o.playoff_pct), bye: Number(o.bye_pct) }));
  const scenarios: Scenario[] = rows.map((r) => ({
    gameWeek: r.game_week,
    winnerId: r.winner_id,
    loserId: r.loser_id,
    outcomePct: Number(r.outcome_pct),
    managerId: r.manager_id,
    playoff: Number(r.playoff_pct),
    bye: Number(r.bye_pct),
  }));
  return <WhatIfPanel scenarios={scenarios} base={base} names={names} />;
}
