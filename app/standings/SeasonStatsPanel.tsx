export type ScoreStat = {
  value: number;
  managerName: string;
  opponentName: string;
  week: number;
  time_of_season: string;
};

export type MarginStat = {
  margin: number;
  winnerName: string;
  loserName: string;
  winnerScore: number;
  loserScore: number;
  week: number;
  time_of_season: string;
};

export type StreakStat = {
  length: number;
  managers: string[];
};

export type TotalStat = {
  value: number;
  managerName: string;
};

export type PctStat = {
  value: number;
  managerName: string;
  actual: number;
  possible: number;
  week: number;
  time_of_season: string;
};

type AllGameStats = {
  highest: ScoreStat | null;
  lowest: ScoreStat | null;
  blowout: MarginStat | null;
  closest: MarginStat | null;
  longestWinStreak: StreakStat;
  longestLossStreak: StreakStat;
};

type RegularSeasonTotals = {
  mostPF: TotalStat | null;
  mostPA: TotalStat | null;
  bestMargin: TotalStat | null;
  worstMargin: TotalStat | null;
};

function weekLabel(week: number, timeOfSeason: string): string {
  return timeOfSeason === "Regular" ? `Wk ${week}` : `Wk ${week} (${timeOfSeason})`;
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-plate border-2 border-coffee rounded-lg shadow-[4px_4px_0_#2B1B12] px-4 py-3">
      <div className="font-mono uppercase tracking-wide text-[10px] text-gravy/60 mb-1">{label}</div>
      <div className="font-display text-xl text-burnt leading-tight">{value}</div>
      {detail && <div className="font-mono text-[11px] text-gravy/70 mt-0.5">{detail}</div>}
    </div>
  );
}

export default function SeasonStatsPanel({
  allGameStats,
  regularSeasonTotals,
  highestPct,
  lowestPct,
}: {
  allGameStats: AllGameStats;
  regularSeasonTotals: RegularSeasonTotals;
  highestPct: PctStat | null;
  lowestPct: PctStat | null;
}) {
  const { highest, lowest, blowout, closest, longestWinStreak, longestLossStreak } = allGameStats;
  const { mostPF, mostPA, bestMargin, worstMargin } = regularSeasonTotals;

  return (
    <div className="max-w-4xl mx-auto mb-12">
      <div className="text-center mb-4">
        <h3 className="font-mono uppercase tracking-[0.2em] text-xs text-gravy/60">Season Stats</h3>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {highest && (
          <StatCard
            label="Highest Score"
            value={highest.value.toFixed(1)}
            detail={`${highest.managerName} vs ${highest.opponentName} \u00b7 ${weekLabel(highest.week, highest.time_of_season)}`}
          />
        )}
        {lowest && (
          <StatCard
            label="Lowest Score"
            value={lowest.value.toFixed(1)}
            detail={`${lowest.managerName} vs ${lowest.opponentName} \u00b7 ${weekLabel(lowest.week, lowest.time_of_season)}`}
          />
        )}
        {blowout && (
          <StatCard
            label="Biggest Blowout"
            value={`+${blowout.margin.toFixed(1)}`}
            detail={`${blowout.winnerName} def. ${blowout.loserName} ${blowout.winnerScore.toFixed(1)}-${blowout.loserScore.toFixed(1)} \u00b7 ${weekLabel(blowout.week, blowout.time_of_season)}`}
          />
        )}
        {closest && (
          <StatCard
            label="Closest Game"
            value={closest.margin.toFixed(1)}
            detail={`${closest.winnerName} def. ${closest.loserName} ${closest.winnerScore.toFixed(1)}-${closest.loserScore.toFixed(1)} \u00b7 ${weekLabel(closest.week, closest.time_of_season)}`}
          />
        )}
        {longestWinStreak.length > 0 && (
          <StatCard
            label="Longest Win Streak"
            value={`${longestWinStreak.length} games`}
            detail={longestWinStreak.managers.join(", ")}
          />
        )}
        {longestLossStreak.length > 0 && (
          <StatCard
            label="Longest Losing Streak"
            value={`${longestLossStreak.length} games`}
            detail={longestLossStreak.managers.join(", ")}
          />
        )}
        {highestPct && (
          <StatCard
            label="Highest % of Max (Single Week)"
            value={`${highestPct.value.toFixed(1)}%`}
            detail={`${highestPct.managerName} \u00b7 ${highestPct.actual.toFixed(1)} of ${highestPct.possible.toFixed(1)} \u00b7 ${weekLabel(highestPct.week, highestPct.time_of_season)}`}
          />
        )}
        {lowestPct && (
          <StatCard
            label="Lowest % of Max (Single Week)"
            value={`${lowestPct.value.toFixed(1)}%`}
            detail={`${lowestPct.managerName} \u00b7 ${lowestPct.actual.toFixed(1)} of ${lowestPct.possible.toFixed(1)} \u00b7 ${weekLabel(lowestPct.week, lowestPct.time_of_season)}`}
          />
        )}
        {mostPF && (
          <StatCard
            label="Most Total PF (Reg. Season)"
            value={mostPF.value.toFixed(1)}
            detail={mostPF.managerName}
          />
        )}
        {mostPA && (
          <StatCard
            label="Most Total PA (Reg. Season)"
            value={mostPA.value.toFixed(1)}
            detail={mostPA.managerName}
          />
        )}
        {bestMargin && (
          <StatCard
            label="Largest Margin, Positive (Reg. Season)"
            value={`+${bestMargin.value.toFixed(1)}`}
            detail={bestMargin.managerName}
          />
        )}
        {worstMargin && (
          <StatCard
            label="Largest Margin, Negative (Reg. Season)"
            value={worstMargin.value.toFixed(1)}
            detail={worstMargin.managerName}
          />
        )}
      </div>
    </div>
  );
}
