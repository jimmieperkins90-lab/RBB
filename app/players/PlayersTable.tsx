"use client";

import { useMemo, useState } from "react";
import type { PlayerSummary } from "./page";

type SortKey = "name" | "position" | "timesStarted" | "careerPPG" | "bestGame";

export default function PlayersTable({ players }: { players: PlayerSummary[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = players;
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q));

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
  }, [players, search, sortKey, sortDir]);

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
