export const FRAME_DIR = "/frames-hero";

export function frameUrl(index: number): string {
  return `${FRAME_DIR}/frame_${String(index + 1).padStart(4, "0")}.webp`;
}