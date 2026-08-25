import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F6EFE1",
        plate: "#FFFBF3",
        biscuit: "#E7CB9E",
        gravy: "#6E4A2E",
        coffee: "#2B1B12",
        burnt: "#B5502E",
        goldenrod: "#C99A3D",
        carolina: "#4B9CD3",
      },
      fontFamily: {
        display: ["var(--font-anton)", "sans-serif"],
        body: ["var(--font-franklin)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      backgroundImage: {
        "diner-stripe":
          "repeating-linear-gradient(135deg, #B5502E 0px, #B5502E 14px, #F6EFE1 14px, #F6EFE1 28px)",
      },
    },
  },
  plugins: [],
};
export default config;
