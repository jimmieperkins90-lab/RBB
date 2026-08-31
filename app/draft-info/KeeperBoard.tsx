"use client";

import { useState } from "react";
import type { TeamKeeperBoard } from "./page";

export default function KeeperBoard({ teams }: { teams: TeamKeeperBoard[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {teams.map((team) => {
        const isOpen = expanded.has(team.managerId);
        const eligibleCount = team.players.filter((p) => p.eligible).length;
        return (
          <div
            key={team.managerId}
            className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden"
          >
            <button
              onClick={() => toggle(team.managerId)}
              className="w-full bg-coffee text-cream flex items-center justify-between px-4 py-3 hover:bg-coffee/90 transition-colors text-left"
            >
              <span className="font-display text-xl tracking-wide">{team.managerName}</span>
              <span className="font-mono text-xs text-cream/70">
                {eligibleCount} eligible {isOpen ? "\u2212" : "+"}
              </span>
            </button>
            {isOpen && (
              <table className="w-full">
                <tbody className="divide-y divide-biscuit/60">
                  {team.players.map((p, i) => (
                    <tr key={i} className={!p.eligible ? "opacity-40" : ""}>
                      <td className="px-4 py-2 text-sm font-semibold text-coffee">{p.name}</td>
                      <td className="px-4 py-2 font-mono text-[10px] text-gravy/50">{p.position}</td>
                      <td className="px-4 py-2 text-right font-mono text-sm font-bold text-burnt whitespace-nowrap">
                        {p.eligible ? `Rd ${p.cost}` : "Not eligible"}
                      </td>
                    </tr>
                  ))}
                  {team.players.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-4 text-sm font-body text-gravy/60">
                        No roster data found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
