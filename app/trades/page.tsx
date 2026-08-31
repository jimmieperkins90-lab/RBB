import { supabase } from "@/lib/supabase";

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

type TradeRow = { id: number; trade_number: number; year: number; trade_date: string; note: string | null };

type AssetDisplay = { label: string };

type ManagerSide = {
  managerId: number;
  managerName: string;
  assets: AssetDisplay[];
};

type Trade = {
  tradeNumber: number;
  date: string;
  sides: ManagerSide[];
};

async function getTrades(): Promise<Trade[]> {
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
    });

    const sides: ManagerSide[] = Array.from(bySide.entries()).map(([managerId, sideAssets]) => ({
      managerId,
      managerName: managerNames.get(managerId) ?? "Unknown",
      assets: sideAssets,
    }));

    return {
      tradeNumber: t.trade_number,
      date: new Date(t.trade_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      sides,
    };
  });

  return trades;
}

export default async function TradesPage() {
  const trades = await getTrades();

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
        {trades.length === 0 && <p className="text-center font-body text-gravy/60">No trades on record yet.</p>}
        <div className="space-y-6">
          {trades.map((trade) => (
            <div
              key={trade.tradeNumber}
              className="bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-coffee text-cream flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-wide">Trade #{trade.tradeNumber}</span>
                <span className="font-mono text-xs text-cream/70">{trade.date}</span>
              </div>
              <div className={`grid ${trade.sides.length === 2 ? "sm:grid-cols-2" : ""} divide-y sm:divide-y-0 sm:divide-x divide-biscuit/60`}>
                {trade.sides.map((side) => (
                  <div key={side.managerId} className="px-4 py-3">
                    <p className="font-display text-lg text-gravy mb-2">{side.managerName} receives</p>
                    <ul className="space-y-1">
                      {side.assets.map((a, i) => (
                        <li key={i} className="text-sm text-coffee font-body">
                          {a.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
