export type FoulProp = {
  name: string;
  side: "home" | "away" | "listed";
  line: number;
  odd: string;
  average: string | null;
  matches: number | null;
  recent: number[];
};
