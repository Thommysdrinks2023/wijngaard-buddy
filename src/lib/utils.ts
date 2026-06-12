import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Nederlandse getalnotatie: 3,5 in plaats van 3.5
export function formatGetal(n: number, decimalen = 1): string {
  return n.toLocaleString("nl-NL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalen,
  });
}
