import { supabase } from "@/lib/supabase";
import PlayersTable from "./PlayersTable";

export const revalidate = 300;

export type PlayerGame = {
  year: number;
  week: number;
  points: number;
  managerId: number;
  managerName: string;
};

export type ManagerBreakdown = {
  managerId: number;
  managerName: string;
  timesStarted: number;
  ppg: number;
  games: { year: number; week: number; points: number }[];
};

export type PlayerSummary = {
  name: string;
  position: string;
  timesStarted: number;
  careerPPG: number;
  bestGame: { points: number; year: number; week: number; managerName: string } | null;
  managerBreakdown: ManagerBreakdown[];
};

export type RecordRow = {
  rank: number;
  playerName: string;
  position: string;
  points: number;
  year: number;
  week: number;
  managerName: string;
};

const POSITION_FILTERS = ["QB", "RB", "WR", "TE", "K", "DEF"];
const CARD_KEYS = ["ALL", ...POSITION_FILTERS];

function matchesPosition(playerPosition: string | null | undefined, positionFilter: string): boolean {
  if (!playerPosition) return false;
  return playerPosition.split("/").includes(positionFilter);
}

// Pages through a Supabase query in chunks so results are never silently
// truncated by the project's "Max Rows" API setting, regardless of how
// many player-games a query spans.
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

type RawGame = {
  year: number;
  week: number;
  manager_id: number;
  player_name: string;
  player_position: string;
  points: number | null;
};

async function getManagerNames(): Promise<Map<number, string>> {
  const { data } = await supabase.from("managers").select("id, name");
  const map = new Map<number, string>();
  (data ?? []).forEach((m: any) => map.set(m.id, m.name));
  return map;
}

// Only rows where the player was actually in the active lineup (not bench/IR)
// count toward "started", PPG, and best-performance stats.
async function getStartedGames(): Promise<RawGame[]> {
  return fetchAllRows<RawGame>((from, to) =>
    supabase
      .from("lineups")
      .select("year, week, manager_id, player_name, player_position, points")
      .not("lineup_pos", "in", "(BN,IR)")
      .neq("player_name", "--empty--")
      .range(from, to)
  );
}

async function buildPlayerData() {
  const [rows, managerNames] = await Promise.all([getStartedGames(), getManagerNames()]);

  const byPlayer = new Map<string, { position: string; games: PlayerGame[] }>();

  rows.forEach((r) => {
    const pts = Number(r.points ?? 0);
    const entry = byPlayer.get(r.player_name) ?? { position: r.player_position, games: [] };
    entry.games.push({
      year: r.year,
      week: r.week,
      points: pts,
      managerId: r.manager_id,
      managerName: managerNames.get(r.manager_id) ?? "Unknown",
    });
    byPlayer.set(r.player_name, entry);
  });

  const players: PlayerSummary[] = [];
  const allGamesFlat: (PlayerGame & { playerName: string; position: string })[] = [];

  byPlayer.forEach((entry, name) => {
    const sortedByPoints = entry.games.slice().sort((a, b) => b.points - a.points);
    const timesStarted = entry.games.length;
    const totalPoints = entry.games.reduce((sum, g) => sum + g.points, 0);
    const careerPPG = timesStarted > 0 ? totalPoints / timesStarted : 0;
    const best = sortedByPoints[0];
    const bestGame = best
      ? { points: best.points, year: best.year, week: best.week, managerName: best.managerName }
      : null;

    const byManager = new Map<
      number,
      { managerId: number; managerName: string; games: { year: number; week: number; points: number }[] }
    >();
    entry.games.forEach((g) => {
      const mb = byManager.get(g.managerId) ?? { managerId: g.managerId, managerName: g.managerName, games: [] };
      mb.games.push({ year: g.year, week: g.week, points: g.points });
      byManager.set(g.managerId, mb);
    });
    const managerBreakdown: ManagerBreakdown[] = Array.from(byManager.values())
      .map((mb) => {
        const total = mb.games.reduce((sum, g) => sum + g.points, 0);
        return {
          managerId: mb.managerId,
          managerName: mb.managerName,
          timesStarted: mb.games.length,
          ppg: mb.games.length > 0 ? total / mb.games.length : 0,
          games: mb.games.slice().sort((a, b) => a.year - b.year || a.week - b.week),
        };
      })
      .sort((a, b) => b.timesStarted - a.timesStarted);

    players.push({
      name,
      position: entry.position,
      timesStarted,
      careerPPG,
      bestGame,
      managerBreakdown,
    });

    entry.games.forEach((g) => allGamesFlat.push({ ...g, playerName: name, position: entry.position }));
  });

  players.sort((a, b) => a.name.localeCompare(b.name));

  const toRecordRows = (games: (PlayerGame & { playerName: string; position: string })[]): RecordRow[] =>
    games
      .slice()
      .sort((a, b) => b.points - a.points)
      .slice(0, 5)
      .map((g, i) => ({
        rank: i + 1,
        playerName: g.playerName,
        position: g.position,
        points: g.points,
        year: g.year,
        week: g.week,
        managerName: g.managerName,
      }));

  const positionRecords: Record<string, RecordRow[]> = {};
  positionRecords.ALL = toRecordRows(allGamesFlat);
  POSITION_FILTERS.forEach((pos) => {
    positionRecords[pos] = toRecordRows(allGamesFlat.filter((g) => matchesPosition(g.position, pos)));
  });

  const managerOptions = Array.from(managerNames.entries())
    .map(([id, mname]) => ({ id, name: mname }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const years = Array.from(new Set(allGamesFlat.map((g) => g.year))).sort((a, b) => b - a);

  return { players, positionRecords, managerOptions, years };
}

export default async function PlayersPage() {
  const { players, positionRecords, managerOptions, years } = await buildPlayerData();

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Every player, every plate</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">PLAYER HISTORY</h1>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10 mb-14">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl text-gravy chalk-shadow bg-plate inline-block px-6 py-2 rounded-lg border-2 border-coffee shadow-[4px_4px_0_#2B1B12]">
            BEST PERFORMANCES
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {CARD_KEYS.map((pos) => (
            <div key={pos} className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
              <div className="bg-coffee text-cream font-display text-lg text-center py-2 tracking-wide">{pos}</div>
              <table className="w-full">
                <tbody className="divide-y divide-biscuit/60">
                  {positionRecords[pos].map((r) => (
                    <tr key={r.rank}>
                      <td className="px-3 py-2 font-mono text-xs text-gravy/50 align-top w-5">{r.rank}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-sm text-coffee leading-tight">{r.playerName}</div>
                        <div className="font-mono text-[10px] text-gravy/60 mt-0.5">
                          {r.managerName} &middot; {r.year} Wk{r.week}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-bold text-burnt align-top">
                        {r.points.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {positionRecords[pos].length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-3 text-xs text-gravy/50 font-body">
                        No data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl text-gravy chalk-shadow">ALL PLAYERS</h2>
          <div className="menu-divider w-32 mx-auto mt-3" />
        </div>
        <PlayersTable players={players} managers={managerOptions} years={years} />
      </section>
    </div>
  );
}
