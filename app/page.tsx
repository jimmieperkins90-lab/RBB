import { supabase } from "@/lib/supabase";
import Link from "next/link";

export const revalidate = 300;

async function getChampionships() {
  const { data } = await supabase
    .from("championships")
    .select("year, type, division, managers(name)")
    .order("year", { ascending: false });
  return (data ?? []) as any[];
}

const NAV_ITEMS = [
  { href: "/power-rankings", label: "Power Rankings", blurb: "The word on the street" },
  { href: "/standings", label: "Seasons", blurb: "See where everyone stacks up" },
  { href: "/matchups", label: "Matchups", blurb: "Box scores, week by week" },
  { href: "/lineups", label: "Lineups", blurb: "Every roster, every player" },
  { href: "/players", label: "Players", blurb: "Every player, every game" },
  { href: "/draft", label: "Drafts", blurb: "Every pick, every year" },
  { href: "/trades", label: "Trades", blurb: "The full trade ledger" },
  { href: "/history", label: "Records", blurb: "Records and receipts" },
  { href: "/draft-info", label: "2026 Draft Info", blurb: "Order, keepers, and traded picks" },
];

export default async function HomePage() {
  const championships = await getChampionships();
  const leagueChamps = championships.filter((c) => c.type === "league");
  const divisionChamps = championships.filter((c) => c.type === "division");

  const divisions = Array.from(new Set(divisionChamps.map((c) => c.division))).sort();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-16 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">Open since 2016</p>
          <h1 className="font-display text-6xl md:text-7xl leading-none chalk-shadow">
            HOME OF THE RBB
          </h1>
        </div>
      </section>

      {/* Rafters: hanging championship banners */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl text-gravy chalk-shadow">HANGING IN THE RAFTERS</h2>
          <div className="menu-divider w-32 mx-auto mt-3" />
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-10">
          {leagueChamps.map((c) => (
            <Banner key={`league-${c.year}`} year={c.year} name={c.managers?.name} label="LEAGUE CHAMPION" color="carolina" />
          ))}
        </div>

        {divisions.length > 0 && (
          <>
            <div className="text-center mt-14 mb-8">
              <h3 className="font-display text-xl text-gravy/70 tracking-wide">DIVISION CHAMPIONS</h3>
            </div>
            <div className="grid sm:grid-cols-3 gap-8">
              {divisions.map((div) => (
                <div key={div}>
                  <p className="text-center font-mono text-xs uppercase text-gravy/60 mb-3">{div}</p>
                  <div className="flex flex-wrap justify-center gap-4">
                    {divisionChamps
                      .filter((c) => c.division === div)
                      .map((c) => (
                        <Banner key={`${div}-${c.year}`} year={c.year} name={c.managers?.name} label={div} color="burnt" small />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Navigation */}
      <section className="max-w-4xl mx-auto px-5 pb-16">
        <div className="text-center mb-8">
          <h2 className="font-display text-3xl text-gravy chalk-shadow">STEP RIGHT UP</h2>
          <div className="menu-divider w-32 mx-auto mt-3" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block bg-plate border-2 border-coffee rounded-lg shadow-[5px_5px_0_#2B1B12] px-5 py-4 hover:shadow-[3px_3px_0_#2B1B12] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <div className="font-display text-2xl text-gravy">{item.label}</div>
              <div className="font-body text-sm text-gravy/60 mt-1">{item.blurb}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Banner({
  year,
  name,
  label,
  color,
  small = false,
}: {
  year: number;
  name?: string;
  label: string;
  color: "goldenrod" | "burnt" | "carolina";
  small?: boolean;
}) {
  const bg = color === "goldenrod" ? "bg-goldenrod" : color === "carolina" ? "bg-carolina" : "bg-burnt";
  const textColor = color === "carolina" ? "text-white" : "text-coffee";
  const width = small ? "w-28" : "w-36";
  return (
    <div className={`relative ${width} flex flex-col items-center`}>
      {/* hanging rod */}
      <div className="w-full h-1.5 bg-coffee rounded-full" />
      <div className="flex gap-6 -mt-0.5">
        <div className="w-0.5 h-3 bg-coffee/60" />
        <div className="w-0.5 h-3 bg-coffee/60" />
      </div>
      <div className={`${bg} ${textColor} rounded-b-md px-3 py-3 text-center shadow-[3px_3px_0_#2B1B12] w-full -mt-px`}>
        <div className="font-mono text-[9px] uppercase tracking-wide opacity-70">{label}</div>
        <div className="font-display text-2xl leading-none mt-1">{year}</div>
        <div className="font-body text-xs font-semibold mt-1 truncate">{name ?? "\u2014"}</div>
      </div>
    </div>
  );
}
