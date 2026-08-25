"use client";

import { useState } from "react";
import GameCard from "./GameCard";

export default function MatchupsSections({
  regularGames,
  playoffGames,
  tbGames,
  year,
  week,
}: {
  regularGames: any[];
  playoffGames: any[];
  tbGames: any[];
  year: number;
  week: number;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const renderGrid = (games: any[], sectionPrefix: string) => (
    <div className="grid sm:grid-cols-2 gap-5 items-start">
      {games.map((g, i) => {
        const key = `${sectionPrefix}-${i}`;
        return (
          <GameCard
            key={key}
            game={g}
            year={year}
            week={week}
            isOpen={openKey === key}
            onToggle={() => setOpenKey((cur) => (cur === key ? null : key))}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {regularGames.length > 0 && renderGrid(regularGames, "reg")}

      {playoffGames.length > 0 && (
        <div className="mt-4">
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 bg-goldenrod text-coffee text-sm font-mono font-bold uppercase rounded-full">
              Championship Bracket
            </span>
          </div>
          {renderGrid(playoffGames, "playoff")}
        </div>
      )}

      {tbGames.length > 0 && (
        <div className="mt-12">
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 bg-gravy text-cream text-sm font-mono font-bold uppercase rounded-full">
              Toilet Bowl
            </span>
          </div>
          {renderGrid(tbGames, "tb")}
        </div>
      )}
    </>
  );
}
