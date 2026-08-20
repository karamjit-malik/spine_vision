import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional Tailwind class names without conflicts. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Human-readable file size, e.g. 2.4 MB. */
export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  // Trailing ".0" reads as noise on round sizes — "10 MB", not "10.0 MB".
  const value = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${value.replace(/\.0$/, "")} ${units[i]}`;
}

/** Short date+time label used in the scan history list. */
export function formatDate(value) {
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Turn "disc_degeneration" into "Disc Degeneration". */
export function titleize(slug = "") {
  return slug
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
