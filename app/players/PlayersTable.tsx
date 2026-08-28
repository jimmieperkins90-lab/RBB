"use client";

import { useMemo, useState } from "react";
import type { PlayerSummary } from "./page";

type SortKey = "name" | "position" | "timesStarted" | "careerPPG" | "bestGame";

const POSITION_FILTERS = ["QB", "RB", "WR", "TE", "K", "DEF"];

function matchesPosition(playerPosition: string | null | undefined, positionFilter: string): boolean {
  if (!playerPosition) return false;
  return playerPosition.split("/").includes(positionFilter);
}

type ManagerOption = { id: number; name: string };

export default function PlayersTable({
  players,
  managers,
  years,
}: {
  players: PlayerSummary[];
  managers: ManagerOption[];
  years: number[];
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [managerFilter, setManagerFilter] = useState<number | "all">("all");
  const [yearFilter, setYearFilter] = useState<number | "all">("all");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "position" ? "asc" : "desc");
    }
  }

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Manager + Year together require the same game to match both (e.g. "started
  // by Josh in 2022"), not just satisfied independently across different games.
  function passesManagerYear(p: PlayerSummary): boolean {
    if (managerFilter === "all" && yearFilter === "all") return true;
    return p.managerBreakdown.some((mb) => {
      if (managerFilter !== "all" && mb.managerId !== managerFilter) return false;
      if (yearFilter === "all") return true;
      return mb.games.some((g) => g.year === yearFilter);
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = players;
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    if (positionFilter !== "all") rows = rows.filter((p) => matchesPosition(p.position, positionFilter));
    if (managerFilter !== "all" || yearFilter !== "all") rows = rows.filter((p) => passesManagerYear(p));

    const dir = sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "position":
          return dir * a.position.localeCompare(b.position);
        case "timesStarted":
          return dir * (a.timesStarted - b.timesStarted);
        case "careerPPG":
          return dir * (a.careerPPG - b.careerPPG);
        case "bestGame":
          return dir * ((a.bestGame?.points ?? 0) - (b.bestGame?.points ?? 0));
        default:
          return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, search, sortKey, sortDir, positionFilter, managerFilter, yearFilter]);

  return (
    <div>
      <div className="mb-4 flex justify-center">
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-4 py-2 rounded-lg border-2 border-coffee font-body text-sm focus:outline-none focus:border-burnt"
        />
      </div>

      <div className="mb-3">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Position</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <FilterChip active={positionFilter === "all"} onClick={() => setPositionFilter("all")}>
            All
          </FilterChip>
          {POSITION_FILTERS.map((pos) => (
            <FilterChip key={pos} active={positionFilter === pos} onClick={() => setPositionFilter(pos)}>
              {pos}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Manager</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <FilterChip active={managerFilter === "all"} onClick={() => setManagerFilter("all")}>
            All
          </FilterChip>
          {managers.map((m) => (
            <FilterChip key={m.id} active={managerFilter === m.id} onClick={() => setManagerFilter(m.id)}>
              {m.name}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <p className="text-center font-mono text-[10px] uppercase text-gravy/50 mb-2">Year</p>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <FilterChip active={yearFilter === "all"} onClick={() => setYearFilter("all")}>
            All
          </FilterChip>
          {years.map((y) => (
            <FilterChip key={y} active={yearFilter === y} onClick={() => setYearFilter(y)}>
              {y}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-coffee text-cream font-mono text-xs uppercase">
              <SortHeader label="Player" sortKeyName="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader label="Pos" sortKeyName="position" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader
                label="Times Started"
                sortKeyName="timesStarted"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortHeader
                label="Career PPG"
                sortKeyName="careerPPG"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortHeader
                label="Best Game"
                sortKeyName="bestGame"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-biscuit/60">
            {filtered.map((p) => (
              <PlayerRow
                key={p.name}
                player={p}
                isExpanded={expanded.has(p.name)}
                onToggle={() => toggleExpand(p.name)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-6 font-body text-gravy/60">
                  No players found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full font-mono text-xs font-semibold border-2 transition-colors ${
        active ? "bg-goldenrod text-coffee border-goldenrod" : "bg-transparent text-gravy border-biscuit hover:border-goldenrod"
      }`}
    >
      {children}
    </button>
  );
}

function SortHeader({
  label,
  sortKeyName,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  sortKeyName: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const active = sortKey === sortKeyName;
  return (
    <th
      onClick={() => onClick(sortKeyName)}
      className="px-3 py-2 text-left cursor-pointer select-none whitespace-nowrap hover:bg-coffee/80"
    >
      {label}
      {active && <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>}
    </th>
  );
}

function PlayerRow({
  player,
  isExpanded,
  onToggle,
}: {
  player: PlayerSummary;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-biscuit/30 transition-colors">
        <td className="px-3 py-2.5 font-semibold text-coffee">{player.name}</td>
        <td className="px-3 py-2.5 font-mono text-xs text-gravy/60">{player.position}</td>
        <td className="px-3 py-2.5 font-mono text-sm text-gravy/80">{player.timesStarted}</td>
        <td className="px-3 py-2.5 font-mono text-sm font-bold text-gravy">{player.careerPPG.toFixed(1)}</td>
        <td className="px-3 py-2.5 font-mono text-sm font-bold text-burnt">
          {player.bestGame ? player.bestGame.points.toFixed(1) : "\u2014"}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="p-0 bg-biscuit/20">
            <PlayerDetail player={player} />
          </td>
        </tr>
      )}
    </>
  );
}

function PlayerDetail({ player }: { player: PlayerSummary }) {
  const [expandedManagers, setExpandedManagers] = useState<Set<number>>(new Set());

  function toggleManager(managerId: number) {
    setExpandedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(managerId)) next.delete(managerId);
      else next.add(managerId);
      return next;
    });
  }

  return (
    <div className="px-4 py-5">
      <p className="font-mono text-[10px] uppercase text-gravy/50 mb-2">Started By</p>
      <div className="space-y-2 max-w-xl">
        {player.managerBreakdown.map((mb) => {
          const isOpen = expandedManagers.has(mb.managerId);
          return (
            <div key={mb.managerId} className="bg-plate border border-biscuit rounded overflow-hidden">
              <button
                onClick={() => toggleManager(mb.managerId)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-biscuit/30 transition-colors text-left"
              >
                <span className="font-semibold text-sm text-coffee">{mb.managerName}</span>
                <span className="font-mono text-xs text-gravy/70 flex items-center gap-2">
                  {mb.timesStarted}x &middot; {mb.ppg.toFixed(1)} ppg
                  <span className="text-gravy/40">{isOpen ? "\u2212" : "+"}</span>
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-2.5 pt-2 border-t border-biscuit/60 flex flex-wrap gap-1.5">
                  {mb.games.map((g, i) => (
                    <span key={i} className="font-mono text-[10px] text-gravy/60 bg-biscuit/40 rounded px-1.5 py-0.5">
                      {g.year} Wk{g.week}: {g.points.toFixed(1)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {player.managerBreakdown.length === 0 && (
          <p className="text-sm font-body text-gravy/60">No manager data found.</p>
        )}
      </div>
    </div>
  );
}
