import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Extracts a useful message from any thrown value. Tauri plugin rejections
// often surface as plain strings or objects without an Error prototype, which
// would otherwise collapse to "Unknown error" and bury the real cause.
export function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  if (err && typeof err === "object") {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message.length > 0) return maybe.message;
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {}
  }
  return `Unknown error (type=${typeof err})`;
}
