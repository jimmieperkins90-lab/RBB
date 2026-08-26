"use client";

import { useState } from "react";
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

type LineupRow = {
  lineup_pos: string;
  player_name: string;
  player_position: string;
  points: number | null;
  proj_points: number | null;
  played: boolean;
  is_keeper: boolean | null;
};

async function fetchRoster(year: number, week: number, managerId: number) {
  const { data } = await supabase
    .from("lineups")
    .select("lineup_pos, player_name, player_position, points, proj_points, played, is_keeper")
    .eq("year", year)
    .eq("week", week)
    .eq("manager_id", managerId)
    .neq("lineup_pos", "IR");

  const rows = ((data ?? []) as LineupRow[]).slice().sort((a, b) => (POS_ORDER[a.lineup_pos] ?? 99) - (POS_ORDER[b.lineup_pos] ?? 99));
  return {
    starters: rows.filter((r) => r.lineup_pos !== "BN"),
    bench: rows.filter((r) => r.lineup_pos === "BN"),
  };
}

export default function GameCard({
  game,
  year,
  week,
  isOpen,
  onToggle,
}: {
  game: any;
  year: number;
  week: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [homeRoster, setHomeRoster] = useState<{ starters: LineupRow[]; bench: LineupRow[] } | null>(null);
  const [awayRoster, setAwayRoster] = useState<{ starters: LineupRow[]; bench: LineupRow[] } | null>(null);

  const handleClick = async () => {
    const willOpen = !isOpen;
    onToggle();
    if (willOpen && !homeRoster) {
      setLoading(true);
      const [h, a] = await Promise.all([
        fetchRoster(year, week, game.homeId),
        fetchRoster(year, week, game.awayId),
      ]);
      setHomeRoster(h);
      setAwayRoster(a);
      setLoading(false);
    }
  };

  return (
    <div className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
      <button
        onClick={handleClick}
        className="w-full text-left px-4 py-2 bg-biscuit/50 flex items-center justify-between font-mono text-sm font-bold uppercase text-gravy/80 hover:bg-biscuit/70 transition-colors"
      >
        <span>{game.roundGame ?? (game.favUnderdog === "EVEN" ? "Toss-up" : "")}</span>
        <span className="text-[10px] font-normal normal-case text-gravy/50">
          {isOpen ? "Hide lineups \u2191" : "See lineups \u2193"}
        </span>
      </button>
      <div className="divide-y divide-biscuit/60">
        <ScoreRow name={game.homeName} record={game.homeRecord} score={game.homeScore} proj={game.homeProj} winner={game.homeWin} />
        <ScoreRow name={game.awayName} record={game.awayRecord} score={game.awayScore} proj={game.awayProj} winner={!game.homeWin} />
      </div>

      {isOpen && (
        <div className="border-t-2 border-coffee bg-cream/40 p-3">
          {loading && <p className="text-center font-body text-sm text-gravy/60 py-4">Loading lineups&hellip;</p>}
          {!loading && homeRoster && awayRoster && (
            <div className="grid sm:grid-cols-2 gap-3">
              <MiniRoster name={game.homeName} roster={homeRoster} />
              <MiniRoster name={game.awayName} roster={awayRoster} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniRoster({ name, roster }: { name: string; roster: { starters: LineupRow[]; bench: LineupRow[] } }) {
  return (
    <div className="bg-plate border border-biscuit rounded-md overflow-hidden">
      <div className="px-3 py-1.5 bg-coffee text-cream font-mono text-xs font-bold uppercase text-center">{name}</div>
      <MiniPlayerList rows={roster.starters} />
      {roster.bench.length > 0 && (
        <>
          <div className="px-3 py-1 bg-biscuit/50 font-mono text-[10px] font-bold uppercase text-gravy/70">Bench</div>
          <MiniPlayerList rows={roster.bench} muted />
        </>
      )}
    </div>
  );
}

function MiniPlayerList({ rows, muted = false }: { rows: LineupRow[]; muted?: boolean }) {
  return (
    <div className={`divide-y divide-biscuit/50 ${muted ? "opacity-70" : ""}`}>
      {rows.map((r, i) => {
        const pts = Number(r.points ?? 0);
        const proj = Number(r.proj_points ?? 0);
        const beat = pts >= proj;
        return (
          <div key={i} className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-[9px] text-gravy/50 w-7 flex-shrink-0">{r.lineup_pos}</span>
              <span className="text-xs font-semibold text-coffee truncate">{r.player_name}</span>
            </div>
            <span className={`font-mono text-xs font-bold flex-shrink-0 ${beat ? "text-green-700" : "text-burnt"}`}>
              {pts.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreRow({
  name,
  record,
  score,
  proj,
  winner,
}: {
  name: string;
  record?: string | null;
  score: number;
  proj: number;
  winner: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${winner ? "bg-goldenrod/10" : ""}`}>
      <span className={`font-semibold ${winner ? "text-coffee" : "text-gravy/70"}`}>
        {name}
        {record && <span className="ml-1.5 font-mono text-[10px] font-normal text-gravy/40">({record})</span>}
        {winner && <span className="ml-2 text-[10px] text-burnt font-mono">W</span>}
      </span>
      <div className="text-right">
        <div className={`font-mono text-lg font-bold ${winner ? "text-green-700" : "text-gravy/60"}`}>
          {Number(score).toFixed(1)}
        </div>
        <div className="font-mono text-[10px] text-gravy/40">proj {Number(proj).toFixed(1)}</div>
      </div>
    </div>
  );
}
