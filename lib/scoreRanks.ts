// Shared score-rank helper used by the Seasons, Matchups and Records pages.
//
// For every played game it answers: where did this team's score rank
//   - that week     (among every score posted that year + week)
//   - that season   (among every score posted that year, all games incl. playoffs/TB)
//   - all time      (among every score ever posted in the league, 2016 onward)
// Ties share a rank (1st, 2nd, 2nd, 4th), so "top 6 that week" is simply weekRank <= 6.
//
// Pure functions only (no Supabase, no React), so this is safe to import from both
// server components and "use client" components.

export type ScoreRank = {
  weekRank: number;
  weekCount: number;
  seasonRank: number;
  seasonCount: number;
  allTimeRank: number;
  allTimeCount: number;
};

export type RankableGame = {
  year: number;
  week: number;
  manager_id: number;
  score: number | string | null;
};

// A manager plays at most once per year + week, so this uniquely identifies a game side.
export function rankKey(year: number, week: number, managerId: number): string {
  return `${year}-${week}-${managerId}`;
}

// Rank of `score` within `sortedDesc` (scores sorted high -> low) = 1 + how many
// scores are strictly higher. Binary search, so ranking every game ever stays fast.
function rankInSortedDesc(sortedDesc: number[], score: number): number {
  let lo = 0;
  let hi = sortedDesc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDesc[mid] > score) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

// Some stored scores carry floating-point noise (e.g. 114.87999999999998), so scores
// are rounded to 2 decimals before ranking — otherwise two equal scores could fail to tie.
function normalize(score: number | string | null): number {
  return Math.round(Number(score ?? 0) * 100) / 100;
}

// Pass EVERY played game you want ranks to be measured against (normally the whole
// league history). Returns ranks for all of them, keyed by rankKey().
export function computeScoreRanks(games: RankableGame[]): Record<string, ScoreRank> {
  const desc = (a: number, b: number) => b - a;
  const all: number[] = [];
  const bySeason = new Map<number, number[]>();
  const byWeek = new Map<string, number[]>();

  games.forEach((g) => {
    const s = normalize(g.score);
    all.push(s);
    const season = bySeason.get(g.year) ?? [];
    season.push(s);
    bySeason.set(g.year, season);
    const wk = `${g.year}-${g.week}`;
    const week = byWeek.get(wk) ?? [];
    week.push(s);
    byWeek.set(wk, week);
  });

  all.sort(desc);
  bySeason.forEach((list) => list.sort(desc));
  byWeek.forEach((list) => list.sort(desc));

  const out: Record<string, ScoreRank> = {};
  games.forEach((g) => {
    const s = normalize(g.score);
    const week = byWeek.get(`${g.year}-${g.week}`) ?? [];
    const season = bySeason.get(g.year) ?? [];
    out[rankKey(g.year, g.week, g.manager_id)] = {
      weekRank: rankInSortedDesc(week, s),
      weekCount: week.length,
      seasonRank: rankInSortedDesc(season, s),
      seasonCount: season.length,
      allTimeRank: rankInSortedDesc(all, s),
      allTimeCount: all.length,
    };
  });
  return out;
}

export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n.toLocaleString("en-US")}${suffix}`;
}

// "Wk 1st/12 · Yr 4th/48 · All 152nd/2,316"
export function formatScoreRank(r: ScoreRank): string {
  return (
    `Wk ${ordinal(r.weekRank)}/${r.weekCount}` +
    ` · Yr ${ordinal(r.seasonRank)}/${r.seasonCount}` +
    ` · All ${ordinal(r.allTimeRank)}/${r.allTimeCount.toLocaleString("en-US")}`
  );
}
