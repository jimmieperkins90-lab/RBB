"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Season = { year: number; num_teams: number };
type Manager = { id: number; name: string };
type Pick = {
  year: number;
  round: number;
  overall: number;
  player_name: string;
  position: string;
  nfl_team: string;
  is_keeper: boolean;
  drafted_by_manager_id: number;
  managerName: string;
  pickLabel: string;
};

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];

function getInitialParams() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    year: p.get("year") ? parseInt(p.get("year")!, 10) : undefined,
    manager: p.get("manager") ? parseInt(p.get("manager")!, 10) : undefined,
    position: p.get("position") ?? undefined,
    keeper: p.get("keeper") ?? undefined,
  };
}

function syncUrl(params: Record<string, string | number | undefined>) {
  if (typeof window === "undefined") return;
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "all") usp.set(k, String(v));
  });
  window.history.replaceState({}, "", `${window.location.pathname}?${usp.toString()}`);
}

export default function DraftPage() {
  const initial = useMemo(getInitialParams, []);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [year, setYear] = useState<number | "all">(initial.year ?? "all" as any);
  const [yearInitialized, setYearInitialized] = useState(false);
  const [managerId, setManagerId] = useState<number | undefined>(initial.manager);
  const [position, setPosition] = useState<string | undefined>(initial.position);
  const [keeper, setKeeper] = useState<"all" | "keeper" | "nonkeeper">(
    (initial.keeper as any) ?? "all"
  );
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);

  // Load seasons + managers once
  useEffect(() => {
    supabase
      .from("seasons")
      .select("year, num_teams")
      .order("year", { ascending: false })
      .then(({ data }) => {
        const ss = (data ?? []) as Season[];
        setSeasons(ss);
        if (!yearInitialized) {
          setYear(initial.year ?? ss[0]?.year ?? "all");
          setYearInitialized(true);
        }
      });
    supabase
      .from("managers")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setManagers((data ?? []) as Manager[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep URL in sync (cosmetic only)
  useEffect(() => {
    syncUrl({ year, manager: managerId, position, keeper: keeper === "all" ? undefined : keeper });
  }, [year, managerId, position, keeper]);

  // Fetch picks whenever filters change
  useEffect(() => {
    if (!yearInitialized || seasons.length === 0) return;
    setLoading(true);

    let q = supabase
      .from("draft_picks")
      .select("year, round, overall, player_name, position, nfl_team, is_keeper, drafted_by_manager_id, managers:drafted_by_manager_id(name)")
      .order("year", { ascending: false })
      .order("overall", { ascending: true })
      .range(0, 4999);

    if (year !== "all") q = q.eq("year", year);
    if (managerId) q = q.eq("drafted_by_manager_id", managerId);
    if (position) q = q.eq("position", position);
    if (keeper === "keeper") q = q.eq("is_keeper", true);
    if (keeper === "nonkeeper") q = q.eq("is_keeper", false);

    const yearToTeams = new Map(seasons.map((s) => [s.year, s.num_teams]));

    q.then(({ data }) => {
      const rows = ((data ?? []) as any[]).map((p) => {
        const teams = yearToTeams.get(p.year) ?? 12;
        const pickInRound = p.overall - (p.round - 1) * teams;
        return {
          ...p,
          managerName: p.managers?.name ?? "Unknown",
          pickLabel: `${p.round}.${String(pickInRound).padStart(2, "0")}`,
        } as Pick;
      });
      setPicks(rows);
      setLoading(false);
    });
  }, [year, managerId, position, keeper, yearInitialized, seasons]);

  // Group by year, then round
  const grouped = useMemo(() => {
    const byYear = new Map<number, Map<number, Pick[]>>();
    picks.forEach((p) => {
      if (!byYear.has(p.year)) byYear.set(p.year, new Map());
      const byRound = byYear.get(p.year)!;
      if (!byRound.has(p.round)) byRound.set(p.round, []);
      byRound.get(p.round)!.push(p);
    });
    return Array.from(byYear.entries()).sort((a, b) => b[0] - a[0]);
  }, [picks]);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Every pick, every year</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">DRAFT HISTORY</h1>
        </div>
      </section>

      {/* Season selector */}
      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          <button
            onClick={() => setYear("all")}
            className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
              year === "all" ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
            }`}
          >
            All Years
          </button>
          {seasons.map((s) => (
            <button
              key={s.year}
              onClick={() => setYear(s.year)}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                year === s.year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {s.year}
            </button>
          ))}
        </div>
      </section>

      {/* Manager filter */}
      <section className="max-w-6xl mx-auto px-5 mt-4">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Manager</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <button
            onClick={() => setManagerId(undefined)}
            className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
              !managerId ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
            }`}
          >
            All
          </button>
          {managers.map((m) => (
            <button
              key={m.id}
              onClick={() => setManagerId(m.id)}
              className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                managerId === m.id ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </section>

      {/* Position + Keeper filters */}
      <section className="max-w-6xl mx-auto px-5 mt-4 flex flex-wrap items-start justify-center gap-8">
        <div>
          <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Position</p>
          <div className="flex flex-wrap items-center gap-1.5 justify-center">
            <button
              onClick={() => setPosition(undefined)}
              className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                !position ? "bg-gravy text-cream border-gravy" : "bg-transparent text-gravy border-biscuit hover:border-gravy"
              }`}
            >
              All
            </button>
            {POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPosition(pos)}
                className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                  position === pos ? "bg-gravy text-cream border-gravy" : "bg-transparent text-gravy border-biscuit hover:border-gravy"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Keeper</p>
          <div className="flex flex-wrap items-center gap-1.5 justify-center">
            {(["all", "keeper", "nonkeeper"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKeeper(k)}
                className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                  keeper === k ? "bg-goldenrod text-coffee border-goldenrod" : "bg-transparent text-gravy border-biscuit hover:border-goldenrod"
                }`}
              >
                {k === "all" ? "All" : k === "keeper" ? "Keepers Only" : "Non-Keepers"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="max-w-2xl mx-auto px-5 py-14">
        <div className="text-center mb-8">
          <h2 className="font-display text-4xl text-gravy chalk-shadow">
            {year === "all" ? "ALL DRAFTS" : `${year} DRAFT`}
          </h2>
          <p className="font-mono text-xs text-gravy/50 mt-2">{picks.length} pick{picks.length === 1 ? "" : "s"}</p>
          <div className="menu-divider w-40 mx-auto mt-3" />
        </div>

        {loading && <p className="text-center font-body text-gravy/60">Loading&hellip;</p>}

        {!loading && grouped.length === 0 && (
          <p className="text-center font-body text-gravy/70">No picks match these filters.</p>
        )}

        {!loading &&
          grouped.map(([y, byRound]) => (
            <div key={y} className="mb-10">
              {year === "all" && (
                <h3 className="font-display text-2xl text-burnt text-center mb-4">{y}</h3>
              )}
              <div className="space-y-6">
                {Array.from(byRound.keys())
                  .sort((a, b) => a - b)
                  .map((r) => (
                    <div key={r} className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
                      <div className="px-4 py-2 bg-burnt text-cream font-display text-lg tracking-wide">
                        ROUND {r}
                      </div>
                      <div className="divide-y divide-biscuit/60">
                        {byRound.get(r)!.map((p, i) => (
                          <div
                            key={i}
                            className={`flex items-center justify-between px-4 py-2.5 ${p.is_keeper ? "bg-goldenrod/10" : ""}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs font-bold text-burnt w-10 flex-shrink-0">{p.pickLabel}</span>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-coffee truncate flex items-center gap-1.5">
                                  {p.player_name}
                                  {p.is_keeper && (
                                    <span className="text-[9px] font-mono uppercase bg-goldenrod/40 text-gravy px-1.5 py-0.5 rounded flex-shrink-0">
                                      Keeper
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[10px] text-gravy/50">
                                  {p.position} &middot; {p.nfl_team}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono text-xs font-semibold text-gravy/70 flex-shrink-0">
                              {p.managerName}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
