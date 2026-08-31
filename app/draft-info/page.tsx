import { supabase } from "@/lib/supabase";
import Link from "next/link";
import KeeperBoard from "./KeeperBoard";

export const revalidate = 300;

// Reverse-standings draft slot assignment (linear order, same every round).
const FINISH_TO_SLOT: Record<string, number> = {
  "7th": 1,
  "8th": 2,
  "9th": 3,
  "10th": 4,
  "11th": 5,
  "12th": 6,
  "5th": 7,
  "6th": 8,
  "4th": 9,
  "3rd": 10,
  "2nd": 11,
  "1st": 12,
};

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

type DraftPickRow = { year: number; round: number; player_name: string; is_keeper: boolean };

// Keeper cost = the round the player was drafted the year BEFORE they were
// first kept (found by walking back through their draft history to the most
// recent non-keeper "fresh draft" row). A player can be kept at most 2
// consecutive years before returning to the draft pool. A year-gap in a
// player's record (e.g. a free-agent pickup, or simply never drafted) resets
// them to an undrafted 10th-round cost.
function computeKeeperInfo(
  playerRows: { year: number; round: number; isKeeper: boolean }[],
  mostRecentDraftYear: number
): { cost: number; eligible: boolean; note: string | null } {
  if (playerRows.length === 0) {
    return { cost: 10, eligible: true, note: "Undrafted" };
  }
  const sorted = playerRows.slice().sort((a, b) => a.year - b.year);
  const last = sorted[sorted.length - 1];
  if (last.year !== mostRecentDraftYear) {
    return { cost: 10, eligible: true, note: "Not in most recent draft" };
  }

  let idx = sorted.length - 1;
  let consecutiveKeeps = 0;
  let anchorRound: number | null = null;

  while (idx >= 0) {
    const row = sorted[idx];
    if (idx < sorted.length - 1 && sorted[idx + 1].year - row.year !== 1) break; // gap breaks the chain
    if (!row.isKeeper) {
      anchorRound = row.round;
      break;
    }
    consecutiveKeeps++;
    idx--;
  }

  const cost = anchorRound ?? 10;
  const eligible = consecutiveKeeps < 2;
  return { cost, eligible, note: null };
}

export type KeeperPlayer = {
  name: string;
  position: string;
  cost: number;
  eligible: boolean;
  note: string | null;
};

export type TeamKeeperBoard = {
  managerId: number;
  managerName: string;
  players: KeeperPlayer[];
};

type DraftSlot = {
  slot: number;
  managerId: number;
  managerName: string;
  finish: string;
};

type TradedPick = {
  round: number;
  slot: number;
  originalManagerName: string;
  currentOwnerName: string;
  note: string | null;
};

async function buildDraftInfo() {
  const [managersRes, draftPickRows, seasonsRes] = await Promise.all([
    supabase.from("managers").select("id, name"),
    fetchAllRows<DraftPickRow>((from, to) =>
      supabase.from("draft_picks").select("year, round, player_name, is_keeper").range(from, to)
    ),
    supabase.from("seasons").select("year").order("year", { ascending: false }).limit(1),
  ]);

  const managerNames = new Map<number, string>();
  (managersRes.data ?? []).forEach((m: any) => managerNames.set(m.id, m.name));

  const latestSeasonYear: number | undefined = (seasonsRes.data ?? [])[0]?.year;
  if (!latestSeasonYear) {
    throw new Error("No seasons found");
  }
  const draftYear = latestSeasonYear + 1;

  const [standingsRes, tradePickAssetsRes, rosterRes] = await Promise.all([
    supabase.from("team_seasons").select("manager_id, final_place").eq("year", latestSeasonYear),
    supabase
      .from("trade_assets")
      .select("pick_round, pick_original_manager_id, receiving_manager_id, trades(trade_date)")
      .eq("asset_type", "pick")
      .eq("pick_year", draftYear),
    supabase.from("current_rosters").select("manager_id, player_name, player_position").eq("year", latestSeasonYear),
  ]);

  const draftOrderBase: DraftSlot[] = (standingsRes.data ?? [])
    .map((row: any) => {
      const slot = FINISH_TO_SLOT[row.final_place];
      return slot
        ? {
            slot,
            managerId: row.manager_id,
            managerName: managerNames.get(row.manager_id) ?? "Unknown",
            finish: row.final_place,
          }
        : null;
    })
    .filter((x): x is DraftSlot => x !== null)
    .sort((a, b) => a.slot - b.slot);

  const slotByManagerId = new Map<number, number>();
  draftOrderBase.forEach((d) => slotByManagerId.set(d.managerId, d.slot));

  const tradedPicks: TradedPick[] = (tradePickAssetsRes.data ?? [])
    .map((t: any) => ({
      round: t.pick_round,
      slot: slotByManagerId.get(t.pick_original_manager_id) ?? 0,
      originalManagerName: managerNames.get(t.pick_original_manager_id) ?? "Unknown",
      currentOwnerName: managerNames.get(t.receiving_manager_id) ?? "Unknown",
      note: t.trades?.trade_date
        ? new Date(t.trades.trade_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null,
    }))
    .sort((a, b) => a.round - b.round || a.slot - b.slot);

  const draftAlreadyHappened = draftPickRows.some((r) => r.year === draftYear);

  const totalRounds = draftPickRows.reduce(
    (max, r) => (r.year === latestSeasonYear && r.round > max ? r.round : max),
    0
  ) || 14;

  const historyByPlayer = new Map<string, { year: number; round: number; isKeeper: boolean }[]>();
  draftPickRows.forEach((r) => {
    const list = historyByPlayer.get(r.player_name) ?? [];
    list.push({ year: r.year, round: r.round, isKeeper: r.is_keeper });
    historyByPlayer.set(r.player_name, list);
  });

  const byManager = new Map<number, { name: string; position: string }[]>();
  (rosterRes.data ?? []).forEach((r: any) => {
    if (r.player_name === "--empty--") return;
    const list = byManager.get(r.manager_id) ?? [];
    if (!list.some((p) => p.name === r.player_name)) {
      list.push({ name: r.player_name, position: r.player_position });
    }
    byManager.set(r.manager_id, list);
  });

  const keeperBoards: TeamKeeperBoard[] = draftOrderBase.map((slotInfo) => {
    const roster = byManager.get(slotInfo.managerId) ?? [];
    const players: KeeperPlayer[] = roster.map((p) => {
      const history = historyByPlayer.get(p.name) ?? [];
      const info = computeKeeperInfo(history, latestSeasonYear);
      return { name: p.name, position: p.position, ...info };
    });
    players.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.name.localeCompare(b.name);
    });
    return { managerId: slotInfo.managerId, managerName: slotInfo.managerName, players };
  });

  return { draftYear, draftOrderBase, tradedPicks, totalRounds, keeperBoards, draftAlreadyHappened };
}

export default async function DraftInfoPage() {
  const { draftYear, draftOrderBase, tradedPicks, totalRounds, keeperBoards, draftAlreadyHappened } = await buildDraftInfo();

  if (draftAlreadyHappened) {
    return (
      <div>
        <section className="relative overflow-hidden bg-coffee text-cream">
          <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
          <div className="relative max-w-6xl mx-auto px-5 py-20 text-center">
            <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">See you next offseason</p>
            <h1 className="font-display text-4xl leading-none chalk-shadow mb-4">
              THE {draftYear} DRAFT IS IN THE BOOKS
            </h1>
            <p className="font-body text-cream/70">Check back after the season for the {draftYear + 1} draft prep.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Everything you need, one spot</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">{draftYear} DRAFT INFO</h1>
        </div>
      </section>

      {/* Draft order */}
      <section className="max-w-2xl mx-auto px-5 -mt-7 relative z-10 mb-14">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl text-gravy chalk-shadow bg-plate inline-block px-6 py-2 rounded-lg border-2 border-coffee shadow-[4px_4px_0_#2B1B12]">
            DRAFT ORDER
          </h2>
          <p className="font-mono text-[10px] uppercase text-gravy/50 mt-2">
            {totalRounds} rounds &middot; same order every round
          </p>
        </div>
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
          <table className="w-full">
            <tbody className="divide-y divide-biscuit/60">
              {draftOrderBase.map((d) => (
                <tr key={d.slot}>
                  <td className="px-4 py-2.5 font-mono text-sm font-bold text-gravy/50 w-10">{d.slot}</td>
                  <td className="px-4 py-2.5 font-semibold text-coffee">{d.managerName}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gravy/50 text-right">
                    {d.finish} in {draftYear - 1}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Traded picks */}
      <section className="max-w-2xl mx-auto px-5 mb-14">
        <div className="text-center mb-6">
          <h2 className="font-display text-2xl text-gravy chalk-shadow">TRADED PICKS</h2>
          <div className="menu-divider w-32 mx-auto mt-3" />
        </div>
        {tradedPicks.length === 0 ? (
          <p className="text-center font-body text-gravy/60">No picks have been traded this offseason.</p>
        ) : (
          <div className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden">
            <table className="w-full">
              <tbody className="divide-y divide-biscuit/60">
                {tradedPicks.map((t, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gravy/50 w-16 whitespace-nowrap">Rd {t.round}</td>
                    <td className="px-4 py-2.5 text-sm text-coffee">
                      <span className="font-semibold">{t.originalManagerName}&rsquo;s</span> pick &rarr;{" "}
                      <span className="font-semibold">{t.currentOwnerName}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-gravy/50 text-right">{t.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-center mt-4">
          <Link href="/trades" className="font-mono text-xs uppercase text-burnt underline hover:text-coffee transition-colors">
            See full trade history &rarr;
          </Link>
        </p>
      </section>

      {/* Keeper options */}
      <section className="max-w-6xl mx-auto px-5 pb-16">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl text-gravy chalk-shadow">KEEPER OPTIONS</h2>
          <div className="menu-divider w-32 mx-auto mt-3" />
          <p className="font-mono text-[10px] uppercase text-gravy/50 mt-3">
            Cost = last drafted round &middot; max 2 consecutive keeper years &middot; undrafted costs a 10th
          </p>
        </div>
        <KeeperBoard teams={keeperBoards} />
      </section>
    </div>
  );
}
