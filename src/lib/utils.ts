import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidInterviewName(name: string): boolean {
  return /^NG\d{2}_\d{3,4}_\d{8}_\d{4}$/.test(name);
}
