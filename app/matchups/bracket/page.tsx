import { supabase } from "@/lib/supabase";

export const revalidate = 300;

async function getSeasons() {
  const { data } = await supabase.from("seasons").select("year").order("year", { ascending: false });
  return (data ?? []).map((s) => s.year as number);
}

async function getBracketData(year: number) {
  const { data } = await supabase
    .from("matchups")
    .select(
      "week, manager_id, opponent_manager_id, score, opp_score, proj_score, opp_proj_score, win, time_of_season, round, round_game, seed, managers:manager_id(name)"
    )
    .eq("year", year)
    .in("time_of_season", ["Playoff", "TB"])
    .eq("game_played", true);

  // group raw rows by pair key so we can read each side's own seed value
  const groups = new Map<string, any[]>();
  (data ?? []).forEach((r: any) => {
    const a = r.manager_id;
    const b = r.opponent_manager_id;
    const key = `${r.time_of_season}-${r.week}-${Math.min(a, b)}-${Math.max(a, b)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  const games: any[] = [];
  groups.forEach((rows) => {
    const home = rows.find((r) => r.manager_id === Math.min(rows[0].manager_id, rows[0].opponent_manager_id));
    const away = rows.find((r) => r.manager_id === Math.max(rows[0].manager_id, rows[0].opponent_manager_id));
    if (!home) return;
    games.push({
      week: home.week,
      timeOfSeason: home.time_of_season,
      round: home.round,
      roundGame: home.round_game,
      homeName: home.managers?.name ?? "Unknown",
      homeScore: home.score,
      homeProj: home.proj_score,
      homeSeed: home.seed,
      homeWin: home.win,
      awayName: away?.managers?.name ?? "Unknown",
      awayScore: away?.score,
      awayProj: away?.proj_score,
      awaySeed: away?.seed,
    });
  });

  const bracket: Record<string, Map<number, any[]>> = { Playoff: new Map(), TB: new Map() };
  games.forEach((g) => {
    const rounds = bracket[g.timeOfSeason];
    if (!rounds) return;
    if (!rounds.has(g.round)) rounds.set(g.round, []);
    rounds.get(g.round)!.push(g);
  });

  // Within a round, marquee games (Championship / Toilet Bowl) always sort above
  // any secondary placement game sharing that round (e.g. 3rd Place, 5th Place).
  const MARQUEE_GAMES = new Set(["Championship", "Toilet Bowl"]);
  function sortRoundGames(list: any[]) {
    list.sort((a, b) => {
      const pa = MARQUEE_GAMES.has(a.roundGame) ? 0 : 1;
      const pb = MARQUEE_GAMES.has(b.roundGame) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.homeSeed ?? 99) - (b.homeSeed ?? 99);
    });
  }

  Object.values(bracket).forEach((rounds) => {
    rounds.forEach((list) => sortRoundGames(list));
  });

  return bracket;
}

const PLAYOFF_PALETTE = [
  { bg: "bg-burnt", text: "text-cream" },
  { bg: "bg-goldenrod", text: "text-coffee" },
  { bg: "bg-gravy", text: "text-cream" },
];

const TB_PALETTE = [
  { bg: "bg-gravy", text: "text-cream" },
  { bg: "bg-coffee", text: "text-cream" },
  { bg: "bg-burnt", text: "text-cream" },
];

function getGameColor(bracketType: "Playoff" | "TB", roundGame: string, roundIndex: number) {
  if (bracketType === "Playoff" && roundGame === "Championship") {
    return { bg: "bg-carolina", text: "text-white" };
  }
  const palette = bracketType === "Playoff" ? PLAYOFF_PALETTE : TB_PALETTE;
  return palette[roundIndex % palette.length];
}

function BracketColumns({ rounds, bracketType }: { rounds: Map<number, any[]>; bracketType: "Playoff" | "TB" }) {
  const roundNums = Array.from(rounds.keys()).sort((a, b) => a - b);
  if (roundNums.length === 0) return null;

  return (
    <div className="flex gap-6 overflow-x-auto pb-4">
      {roundNums.map((rn, roundIndex) => {
        const games = rounds.get(rn)!;
        const columnLabel = `Round ${roundIndex + 1}`;
        return (
          <div key={rn} className="flex-shrink-0 w-64">
            <h4 className="font-display text-xl text-gravy mb-3 text-center tracking-wide chalk-shadow">
              {columnLabel}
            </h4>
            <div className="space-y-4">
              {games.map((g, i) => {
                const color = getGameColor(bracketType, g.roundGame, roundIndex);
                return (
                  <div
                    key={i}
                    className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] overflow-hidden"
                  >
                    <div className={`px-3 py-2 font-mono text-sm font-extrabold uppercase tracking-wide ${color.bg} ${color.text}`}>
                      {g.roundGame}
                    </div>
                    <BracketRow name={g.homeName} seed={g.homeSeed} score={g.homeScore} proj={g.homeProj} winner={g.homeWin} />
                    <BracketRow name={g.awayName} seed={g.awaySeed} score={g.awayScore} proj={g.awayProj} winner={!g.homeWin} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BracketRow({
  name,
  seed,
  score,
  proj,
  winner,
}: {
  name: string;
  seed: number | null;
  score: number | null;
  proj: number | null;
  winner: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-t border-biscuit/60 ${winner ? "bg-goldenrod/10" : ""}`}>
      <span className={`text-sm font-semibold flex items-center gap-1.5 ${winner ? "text-coffee" : "text-gravy/60"}`}>
        {seed != null && <span className="font-mono text-[10px] text-gravy/40">#{seed}</span>}
        {name}
      </span>
      <div className="text-right">
        <div className={`font-mono text-sm font-bold ${winner ? "text-green-700" : "text-gravy/50"}`}>
          {score != null ? Number(score).toFixed(1) : "\u2014"}
        </div>
        {proj != null && (
          <div className="font-mono text-[10px] text-gravy/40">proj {Number(proj).toFixed(1)}</div>
        )}
      </div>
    </div>
  );
}

export default async function BracketPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const seasons = await getSeasons();
  const latestYear = seasons[0] ?? 2025;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : latestYear;
  const bracket = await getBracketData(year);

  const hasPlayoff = bracket.Playoff.size > 0;
  const hasTb = bracket.TB.size > 0;

  return (
    <div>
      <section className="relative overflow-hidden bg-coffee text-cream">
        <div className="absolute inset-0 bg-diner-stripe opacity-[0.07]" />
        <div className="relative max-w-6xl mx-auto px-5 py-14 text-center">
          <p className="font-mono uppercase tracking-[0.3em] text-burnt text-xs mb-4">How it all played out</p>
          <h1 className="font-display text-5xl leading-none chalk-shadow">{year} BRACKET</h1>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 -mt-7 relative z-10">
        <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3 flex flex-wrap items-center gap-2 justify-center">
          <span className="font-display text-lg text-gravy mr-2">SEASON</span>
          {seasons.map((y) => (
            <a
              key={y}
              href={`/matchups/bracket?year=${y}`}
              className={`px-3 py-1 rounded font-mono text-sm font-semibold border-2 transition-colors ${
                y === year ? "bg-burnt text-cream border-burnt" : "bg-transparent text-gravy border-biscuit hover:border-burnt"
              }`}
            >
              {y}
            </a>
          ))}
        </div>
        <div className="flex justify-center mt-3">
          <a
            href={`/matchups?year=${year}`}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-coffee text-cream font-mono text-xs font-bold uppercase tracking-wide hover:bg-gravy transition-colors"
          >
            &larr; Back to Matchups
          </a>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 py-14 space-y-16">
        {!hasPlayoff && !hasTb && (
          <p className="text-center font-body text-gravy/70">No playoff bracket found for {year} yet.</p>
        )}

        {hasPlayoff && (
          <div>
            <div className="text-center mb-6">
              <span className="inline-block px-4 py-1.5 bg-goldenrod text-coffee text-sm font-mono font-bold uppercase rounded-full">
                Championship Bracket
              </span>
            </div>
            <BracketColumns rounds={bracket.Playoff} bracketType="Playoff" />
          </div>
        )}

        {hasTb && (
          <div>
            <div className="text-center mb-6">
              <span className="inline-block px-4 py-1.5 bg-gravy text-cream text-sm font-mono font-bold uppercase rounded-full">
                Toilet Bowl
              </span>
            </div>
            <BracketColumns rounds={bracket.TB} bracketType="TB" />
          </div>
        )}
      </section>
    </div>
  );
}
