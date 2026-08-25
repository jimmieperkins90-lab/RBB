"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const POS_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  FLEX: 4,
  K: 5,
  DEF: 6,
  BN: 7,
  IR: 8,
};

type Manager = { id: number; name: string };
type LineupRow = {
  week?: number;
  lineup_pos: string;
  player_name: string;
  player_position: string;
  points: number | null;
  proj_points: number | null;
  played: boolean;
  is_keeper: boolean | null;
};
type Roster = { starters: LineupRow[]; bench: LineupRow[]; ir: LineupRow[]; total: number; totalProj: number };
type WeekRoster = { week: number; starters: LineupRow[]; bench: LineupRow[]; total: number; totalProj: number };

function getInitialParams() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    year: p.get("year") ? parseInt(p.get("year")!, 10) : undefined,
    week: p.get("week") ? parseInt(p.get("week")!, 10) : undefined,
    manager: p.get("manager") ? parseInt(p.get("manager")!, 10) : undefined,
    opponent: p.get("opponent") ? parseInt(p.get("opponent")!, 10) : undefined,
  };
}

function syncUrl(params: Record<string, string | number | undefined>) {
  if (typeof window === "undefined") return;
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) usp.set(k, String(v));
  });
  const newUrl = `${window.location.pathname}?${usp.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function sortByPos(rows: LineupRow[]) {
  return rows.slice().sort((a, b) => (POS_ORDER[a.lineup_pos] ?? 99) - (POS_ORDER[b.lineup_pos] ?? 99));
}

async function fetchRoster(year: number, week: number, managerId: number): Promise<Roster> {
  const { data } = await supabase
    .from("lineups")
    .select("lineup_pos, player_name, player_position, points, proj_points, played, is_keeper")
    .eq("year", year)
    .eq("week", week)
    .eq("manager_id", managerId);

  const rows = sortByPos((data ?? []) as LineupRow[]);
  const starters = rows.filter((r) => r.lineup_pos !== "BN" && r.lineup_pos !== "IR");
  const bench = rows.filter((r) => r.lineup_pos === "BN");
  const ir = rows.filter((r) => r.lineup_pos === "IR");
  const total = starters.reduce((sum, r) => sum + Number(r.points ?? 0), 0);
  const totalProj = starters.reduce((sum, r) => sum + Number(r.proj_points ?? 0), 0);

  return { starters, bench, ir, total, totalProj };
}

async function fetchSeasonRoster(year: number, managerId: number): Promise<WeekRoster[]> {
  const { data } = await supabase
    .from("lineups")
    .select("week, lineup_pos, player_name, player_position, points, proj_points, played, is_keeper")
    .eq("year", year)
    .eq("manager_id", managerId)
    .neq("lineup_pos", "IR")
    .range(0, 999);

  const byWeek = new Map<number, LineupRow[]>();
  ((data ?? []) as LineupRow[]).forEach((r) => {
    const w = r.week!;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w)!.push(r);
  });

  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  return weeks.map((w) => {
    const rows = sortByPos(byWeek.get(w)!);
    const starters = rows.filter((r) => r.lineup_pos !== "BN");
    const bench = rows.filter((r) => r.lineup_pos === "BN");
    const total = starters.reduce((sum, r) => sum + Number(r.points ?? 0), 0);
    const totalProj = starters.reduce((sum, r) => sum + Number(r.proj_points ?? 0), 0);
    return { week: w, starters, bench, total, totalProj };
  });
}

export default function LineupsPage() {
  const initial = useMemo(getInitialParams, []);

  const [seasons, setSeasons] = useState<number[]>([]);
  const [year, setYear] = useState<number | undefined>(initial.year);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [week, setWeek] = useState<number | undefined>(initial.week);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managerId, setManagerId] = useState<number | undefined>(initial.manager);
  const [opponentId, setOpponentId] = useState<number | undefined>(initial.opponent);
  const [viewMode, setViewMode] = useState<"week" | "season">("week");

  const [rosterA, setRosterA] = useState<Roster | null>(null);
  const [rosterB, setRosterB] = useState<Roster | null>(null);
  const [seasonA, setSeasonA] = useState<WeekRoster[] | null>(null);
  const [seasonB, setSeasonB] = useState<WeekRoster[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Load seasons once
  useEffect(() => {
    supabase
      .from("seasons")
      .select("year")
      .order("year", { ascending: false })
      .then(({ data }) => {
        const ys = (data ?? []).map((s: any) => s.year as number);
        setSeasons(ys);
        setYear((cur) => cur ?? ys[0]);
      });
  }, []);

  // Load weeks + managers when year changes
  useEffect(() => {
    if (!year) return;
    supabase
      .from("lineups")
      .select("week")
      .eq("year", year)
      .then(({ data }) => {
        const ws = Array.from(new Set((data ?? []).map((r: any) => r.week as number))).sort((a, b) => a - b);
        setWeeks(ws);
        setWeek((cur) => (cur && ws.includes(cur) ? cur : ws[ws.length - 1]));
      });
    supabase
      .from("team_seasons")
      .select("manager_id, managers(name)")
      .eq("year", year)
      .then(({ data }) => {
        const ms = (data ?? [])
          .map((r: any) => ({ id: r.manager_id, name: r.managers?.name ?? "Unknown" }))
          .sort((a: Manager, b: Manager) => a.name.localeCompare(b.name));
        setManagers(ms);
        setManagerId((cur) => (cur && ms.some((m) => m.id === cur) ? cur : ms[0]?.id));
      });
  }, [year]);

  // Keep URL in sync (cosmetic, no navigation/reload)
  useEffect(() => {
    syncUrl({ year, week, manager: managerId, opponent: opponentId });
  }, [year, week, managerId, opponentId]);

  // Fetch data whenever selection or view mode changes
  useEffect(() => {
    if (!year || !managerId) return;
    setLoading(true);

    if (viewMode === "week") {
      if (!week) return;
      const jobs: Promise<any>[] = [fetchRoster(year, week, managerId)];
      if (opponentId) jobs.push(fetchRoster(year, week, opponentId));
      Promise.all(jobs).then(([a, b]) => {
        setRosterA(a);
        setRosterB(opponentId ? b : null);
        setLoading(false);
      });
    } else {
      const jobs: Promise<any>[] = [fetchSeasonRoster(year, managerId)];
      if (opponentId) jobs.push(fetchSeasonRoster(year, opponentId));
      Promise.all(jobs).then(([a, b]) => {
        setSeasonA(a);
        setSeasonB(opponentId ? b : null);
        setLoading(false);
      });
    }
  }, [year, week, managerId, opponentId, viewMode]);

  const activeManager = managers.find((m) => m.id === managerId);
  const activeOpponent = managers.find((m) => m.id === opponentId);

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Every plate, every player</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">LINEUPS</h1>
        </div>
      </section>

      {/* Season selector */}
      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {seasons.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                y === year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </section>

      {/* View mode toggle */}
      <section className="max-w-6xl mx-auto px-5 mt-4">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setViewMode("week")}
            className={`px-4 py-1.5 rounded-full font-mono text-xs font-bold uppercase border-2 transition-colors ${
              viewMode === "week" ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
            }`}
          >
            Single Week
          </button>
          <button
            onClick={() => setViewMode("season")}
            className={`px-4 py-1.5 rounded-full font-mono text-xs font-bold uppercase border-2 transition-colors ${
              viewMode === "season" ? "bg-coffee text-cream border-coffee" : "bg-transparent text-gravy border-biscuit hover:border-coffee"
            }`}
          >
            Full Season
          </button>
        </div>
      </section>

      {/* Week selector (only in week mode) */}
      {viewMode === "week" && (
        <section className="max-w-6xl mx-auto px-5 mt-4">
          <div className="flex flex-wrap items-center gap-1.5 justify-center">
            {weeks.map((w) => (
              <button
                key={w}
                onClick={() => setWeek(w)}
                className={`w-9 h-9 flex items-center justify-center rounded-full font-mono text-xs font-bold border-2 transition-colors ${
                  w === week ? "bg-gravy text-cream border-gravy" : "bg-transparent text-gravy border-biscuit hover:border-gravy"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Manager selector */}
      <section className="max-w-6xl mx-auto px-5 mt-4">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Team</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          {managers.map((m) => (
            <button
              key={m.id}
              onClick={() => setManagerId(m.id)}
              disabled={m.id === opponentId}
              className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                m.id === managerId
                  ? "bg-coffee text-cream border-coffee"
                  : m.id === opponentId
                  ? "opacity-30 border-biscuit cursor-not-allowed"
                  : "bg-transparent text-gravy border-biscuit hover:border-coffee"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </section>

      {/* Opponent / compare selector */}
      <section className="max-w-6xl mx-auto px-5 mt-4">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Compare vs (optional)</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <button
            onClick={() => setOpponentId(undefined)}
            className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
              !opponentId ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
            }`}
          >
            None
          </button>
          {managers
            .filter((m) => m.id !== managerId)
            .map((m) => (
              <button
                key={m.id}
                onClick={() => setOpponentId(m.id)}
                className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
                  m.id === opponentId ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
                }`}
              >
                {m.name}
              </button>
            ))}
        </div>
      </section>

      {/* Content */}
      <section className="max-w-5xl mx-auto px-5 py-14">
        {viewMode === "week" && (
          <>
            <div className="text-center mb-8">
              <p className="font-mono text-sm text-gravy/60">
                Week {week} &middot; {year}
              </p>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            {loading && <p className="text-center font-body text-gravy/60">Loading&hellip;</p>}
            {!loading && (
              <div className={opponentId ? "grid md:grid-cols-2 gap-6" : "max-w-2xl mx-auto"}>
                <RosterCard name={activeManager?.name} roster={rosterA} />
                {opponentId && <RosterCard name={activeOpponent?.name} roster={rosterB} />}
              </div>
            )}
          </>
        )}

        {viewMode === "season" && (
          <>
            <div className="text-center mb-8">
              <p className="font-mono text-sm text-gravy/60">Full Season &middot; {year}</p>
              <div className="menu-divider w-40 mx-auto mt-3" />
            </div>
            {loading && <p className="text-center font-body text-gravy/60">Loading&hellip;</p>}
            {!loading && (
              <div className={opponentId ? "grid md:grid-cols-2 gap-6" : "max-w-2xl mx-auto"}>
                <SeasonCard name={activeManager?.name} weeks={seasonA} />
                {opponentId && <SeasonCard name={activeOpponent?.name} weeks={seasonB} />}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SeasonCard({ name, weeks }: { name?: string; weeks: WeekRoster[] | null }) {
  return (
    <div>
      <h2 className="font-display text-3xl text-gravy chalk-shadow text-center mb-4">{name ?? "\u2014"}</h2>
      {!weeks && <p className="text-center font-body text-gravy/70">No data found.</p>}
      {weeks && weeks.length === 0 && <p className="text-center font-body text-gravy/70">No lineups found for this season.</p>}
      <div className="space-y-4">
        {weeks?.map((w) => (
          <div key={w.week} className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
            <div className="px-4 py-2 bg-burnt text-cream flex items-center justify-between">
              <span className="font-display text-base tracking-wide">WEEK {w.week}</span>
              <span className="font-mono text-sm font-bold">
                {w.total.toFixed(1)} <span className="text-cream/60">/ proj {w.totalProj.toFixed(1)}</span>
              </span>
            </div>
            <PlayerTable rows={w.starters} />
            {w.bench.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-biscuit/50 font-mono text-xs font-bold uppercase text-gravy/80">Bench</div>
                <PlayerTable rows={w.bench} muted />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RosterCard({ name, roster }: { name?: string; roster: Roster | null }) {
  return (
    <div>
      <h2 className="font-display text-3xl text-gravy chalk-shadow text-center mb-4">{name ?? "\u2014"}</h2>
      {!roster && <p className="text-center font-body text-gravy/70">No roster data found.</p>}
      {roster && (
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[6px_6px_0_#2B1B12] overflow-hidden">
          <div className="px-4 py-3 bg-burnt text-cream flex items-center justify-between">
            <span className="font-display text-lg tracking-wide">STARTERS</span>
            <span className="font-mono text-sm font-bold">
              {roster.total.toFixed(1)} <span className="text-cream/60">/ proj {roster.totalProj.toFixed(1)}</span>
            </span>
          </div>
          <PlayerTable rows={roster.starters} />

          {roster.bench.length > 0 && (
            <>
              <div className="px-4 py-2 bg-biscuit/50 font-mono text-sm font-bold uppercase text-gravy/80">Bench</div>
              <PlayerTable rows={roster.bench} muted />
            </>
          )}

          {roster.ir.length > 0 && (
            <>
              <div className="px-4 py-2 bg-biscuit/50 font-mono text-sm font-bold uppercase text-gravy/80">IR</div>
              <PlayerTable rows={roster.ir} muted />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerTable({ rows, muted = false }: { rows: LineupRow[]; muted?: boolean }) {
  return (
    <div className="divide-y divide-biscuit/60">
      {rows.map((r, i) => {
        const pts = Number(r.points ?? 0);
        const proj = Number(r.proj_points ?? 0);
        const beat = pts >= proj;
        return (
          <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${muted ? "opacity-70" : ""}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[10px] text-gravy/50 w-9 flex-shrink-0">{r.lineup_pos}</span>
              <span className="text-sm font-semibold text-coffee truncate">{r.player_name}</span>
              <span className="font-mono text-[10px] text-gravy/40 flex-shrink-0">{r.player_position}</span>
              {r.is_keeper && (
                <span className="text-[9px] font-mono uppercase bg-goldenrod/30 text-gravy px-1.5 py-0.5 rounded flex-shrink-0">
                  Keeper
                </span>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`font-mono text-sm font-bold ${beat ? "text-green-700" : "text-burnt"}`}>
                {pts.toFixed(1)}
              </span>
              <span className="font-mono text-[10px] text-gravy/40 ml-1.5">/{proj.toFixed(1)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
