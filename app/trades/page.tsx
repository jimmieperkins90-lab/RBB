import { supabase } from "@/lib/supabase";
import TradesList from "./TradesList";

export const revalidate = 300;

type TradeAssetRow = {
  trade_id: number;
  receiving_manager_id: number;
  asset_type: "player" | "pick";
  player_name: string | null;
  player_position: string | null;
  nfl_team: string | null;
  pick_year: number | null;
  pick_round: number | null;
  pick_original_manager_id: number | null;
};

type AssetDisplay = { label: string };

type ManagerSide = {
  managerId: number;
  managerName: string;
  assets: AssetDisplay[];
};

export type Trade = {
  tradeNumber: number;
  year: number;
  date: string;
  sides: ManagerSide[];
};

export type ManagerOption = { id: number; name: string };

async function getTrades(): Promise<{ trades: Trade[]; years: number[]; managers: ManagerOption[] }> {
  const [tradesRes, assetsRes, managersRes] = await Promise.all([
    supabase.from("trades").select("id, trade_number, year, trade_date, note").order("trade_date", { ascending: false }),
    supabase
      .from("trade_assets")
      .select(
        "trade_id, receiving_manager_id, asset_type, player_name, player_position, nfl_team, pick_year, pick_round, pick_original_manager_id"
      ),
    supabase.from("managers").select("id, name"),
  ]);

  const managerNames = new Map<number, string>();
  (managersRes.data ?? []).forEach((m: any) => managerNames.set(m.id, m.name));

  const assetsByTrade = new Map<number, TradeAssetRow[]>();
  (assetsRes.data ?? []).forEach((a: any) => {
    const list = assetsByTrade.get(a.trade_id) ?? [];
    list.push(a);
    assetsByTrade.set(a.trade_id, list);
  });

  const involvedManagerIds = new Set<number>();

  const trades: Trade[] = (tradesRes.data ?? []).map((t: any) => {
    const assets = assetsByTrade.get(t.id) ?? [];
    const bySide = new Map<number, AssetDisplay[]>();
    assets.forEach((a) => {
      const list = bySide.get(a.receiving_manager_id) ?? [];
      if (a.asset_type === "player") {
        list.push({ label: `${a.player_position ?? ""} ${a.player_name ?? ""} (${a.nfl_team ?? ""})`.trim() });
      } else {
        const originalName = a.pick_original_manager_id ? managerNames.get(a.pick_original_manager_id) ?? "Unknown" : "Unknown";
        list.push({ label: `${a.pick_year} Round ${a.pick_round} pick (from ${originalName})` });
      }
      bySide.set(a.receiving_manager_id, list);
      involvedManagerIds.add(a.receiving_manager_id);
    });

    const sides: ManagerSide[] = Array.from(bySide.entries()).map(([managerId, sideAssets]) => ({
      managerId,
      managerName: managerNames.get(managerId) ?? "Unknown",
      assets: sideAssets,
    }));

    return {
      tradeNumber: t.trade_number,
      year: t.year,
      date: new Date(t.trade_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      sides,
    };
  });

  const years = Array.from(new Set(trades.map((t) => t.year))).sort((a, b) => b - a);
  const managers = Array.from(involvedManagerIds)
    .map((id) => ({ id, name: managerNames.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { trades, years, managers };
}

export default async function TradesPage() {
  const { trades, years, managers } = await getTrades();

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">The full ledger</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">TRADES</h1>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-5 py-14">
        <TradesList trades={trades} years={years} managers={managers} />
      </section>
    </div>
  );
}
