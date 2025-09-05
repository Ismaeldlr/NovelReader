export type Theme = {
  colors: {
    bg: string;        // page background
    card: string;      // surfaces
    text: string;      // primary text
    textDim: string;   // secondary text
    border: string;    // hairlines
    tint: string;      // brand/accent
    bgElevated: string; // elevated background
  };
  spacing: (n: number) => number;
  radius: { sm: number; md: number; lg: number; xl: number };
  font: { xs: number; sm: number; md: number; lg: number; xl: number; };
};

export const lightTheme: Theme = {
  colors: {
    bg: "#FFFFFF",
    card: "#F7F8FA",
    text: "#0B0C10",
    textDim: "#6B7280",
    border: "rgba(0,0,0,0.08)",
    tint: "#5B8CFF",
    bgElevated: "#e9ecef",
  },
  spacing: n => 4 * n,
  radius: { sm: 6, md: 10, lg: 14, xl: 20 },
  font: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
};

export const darkTheme: Theme = {
  colors: {
    bg: "#0B0C10",
    card: "#10141A",
    text: "#FFFFFF",
    textDim: "#9AA0A6",
    border: "rgba(255,255,255,0.08)",
    tint: "#7AA2FF",
  bgElevated: "#23272f",
  },
  spacing: n => 4 * n,
  radius: { sm: 6, md: 10, lg: 14, xl: 20 },
  font: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
};
