"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { HeroScrub } from "@/components/ui/hero-scrub";
import { frameUrl } from "@/lib/frames";

// const SERVICES = [
//   {
//     id: "01",
//     title: "Web Development",
//     desc: "Fast, secure, and scalable websites built with modern, battle-tested tooling.",
//     icon: FaGlobe,
//     accent: "#fbbf24",
//     glow: "rgba(251,191,36,0.5)",
//     tags: ["React", "Next.js", "Tailwind", "Vercel"],
//   },
//   {
//     id: "02",
//     title: "WordPress",
//     desc: "Fully custom WordPress builds with Elementor, WooCommerce, and ACF.",
//     icon: FaWordpress,
//     accent: "#fbbf24",
//     glow: "rgba(251,191,36,0.5)",
//     tags: ["Elementor", "WooCommerce", "ACF"],
//   },
//   {
//     id: "03",
//     title: "React & Next.js",
//     desc: "Modern frontend with React and Next.js — blazing-fast and dynamic.",
//     icon: FaReact,
//     accent: "#fbbf24",
//     glow: "rgba(251,191,36,0.5)",
//     tags: ["SPA", "SSR / SSG", "Motion"],
//   },
//   {
//     id: "04",
//     title: "UI / UX Design",
//     desc: "Visually stunning interfaces designed to improve engagement and conversion.",
//     icon: FaPalette,
//     accent: "#fbbf24",
//     glow: "rgba(251,191,36,0.5)",
//     tags: ["Figma", "Design Systems", "Prototypes"],
//   },
//   {
//     id: "05",
//     title: "Performance",
//     desc: "Core Web Vitals, image optimization and code-splitting for lightning-fast loads.",
//     icon: FaBolt,
//     accent: "#fbbf24",
//     glow: "rgba(251,191,36,0.5)",
//     tags: ["Lighthouse 100", "Lazy Loading", "Splitting"],
//   },
// ];

function subscribeReduced(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const smooth = (p: number) => {
  const x = Math.max(0, Math.min(1, p));
  return x * x * (3 - 2 * x);
};

// The full frame sequence (480) is divided equally among the services. Each
// service is bound to its own slice of frames and drifts up slowly — entering
// in the lower area (~75vh) and rising to the upper area (~15vh) — gliding at
// roughly the video's pace. Consecutive services CROSS-DISSOLVE: the outgoing
// one fades out during the last `CROSS` of its window AND the first `CROSS`
// past the boundary, while the next fades in during the `CROSS` before its
// window plus the first `CROSS` of it — so both are briefly visible together
// and the hand-off reads like a film dissolve, never a sudden swap.
const CROSS = 0.18;

const serviceMotion = (
  progress: number,
  index: number,
  count: number
): CSSProperties => {
  const start = index / count;
  const end = (index + 1) / count;
  const span = end - start;
  if (span <= 0)
    return { opacity: 0, transform: "translateY(75vh)" };
  const t = (progress - start) / span;
  const fadeIn = smooth(Math.max(0, Math.min(1, (t + CROSS) / (2 * CROSS))));
  const fadeOut = smooth(
    Math.max(0, Math.min(1, (1 + CROSS - t) / (2 * CROSS)))
  );
  return {
    opacity: Math.min(fadeIn, fadeOut),
    transform: `translateY(${(1 - t) * 60 + 15}vh)`,
  };
};

export default function Hero() {
  const reduced = useSyncExternalStore(
    subscribeReduced,
    getReducedSnapshot,
    () => false
  );

  return (
    <HeroScrub
      id="home"
      frameCount={450}
      frameUrl={frameUrl}
      titleTop="KANHA"
      titleBottom="JATTHAP"
      accentHex="#fbbf24"
      titleMotion={(progress) => {
        if (reduced)
          return {
            eyebrow: { opacity: 1, transform: "translateY(0px)" },
            top: { opacity: 1, transform: "translateY(0px)" },
            bottom: { opacity: 1, transform: "translateY(0px)" },
          };
        // The title rides the film like the services: it drifts in from the
        // bottom, passes through center, and exits toward the top as you
        // scroll — fading only at the very start and very end.
        const fadeIn = smooth(Math.max(0, Math.min(1, progress / 0.06)));
        const fadeOut = smooth(Math.max(0, Math.min(1, (1 - progress) / 0.06)));
        const opacity = Math.min(fadeIn, fadeOut);
        const transform = `translateY(${(0.5 - progress) * 110}vh)`;
        return {
          eyebrow: { opacity, transform },
          top: { opacity, transform },
          bottom: { opacity, transform },
        };
      }}
    >
      {(progress) => (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* ============================================================
              Original hero content (commented out on request)
          ============================================================ */}
          {/* <div className="absolute inset-x-0 bottom-[6.5rem] z-10 flex flex-col items-center gap-5 px-6 text-center">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {ROLES.map((role, i) => (
                <span
                  key={role}
                  className="flex items-center gap-6"
                  style={revealed ?? reveal(progress, 0.26 + i * 0.055, 0.32 + i * 0.055)}
                >
                  <span className="font-mono text-xs uppercase tracking-[0.35em] text-fg/60 md:text-sm">
                    {role}
                  </span>
                  {i < ROLES.length - 1 && (
                    <span className="h-1 w-1 rounded-full bg-gold/60" />
                  )}
                </span>
              ))}
            </div>

            <p
              className="mx-auto max-w-xl text-sm leading-relaxed text-fg/55 md:text-base"
              style={revealed ?? reveal(progress, 0.44, 0.52)}
            >
              I craft cinematic, high-performance digital experiences — where luxury
              design meets engineering precision.
            </p>

            <div style={revealed ?? reveal(progress, 0.56, 0.64)}>
              <Magnetic
                strength={0.25}
                className="pointer-events-auto inline-block"
              >
                <a
                  href="#about"
                  className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-fg/20 bg-fg/5 px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.2em] text-fg backdrop-blur-xl transition-colors hover:border-gold/40"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-fg/15 to-transparent" />
                  <span className="relative">Explore Work</span>
                  <span className="relative text-gold transition-transform duration-300 group-hover:translate-y-0.5">
                    ↓
                  </span>
                </a>
              </Magnetic>
            </div>
          </div> */}

           {/* ============================================================
               Services — the 450 frames are divided equally (90 each). Each
               service rides up from the bottom to the top of the screen
               during its own frame slice, like an overlay in the video.
               (commented out — frame-based animation only)
           ============================================================ */}
           {/* <Service
             progress={progress}
             reduced={reduced}
             index={0}
             count={SERVICES.length}
             className="left-[6%] md:left-[10%]"
             service={SERVICES[0]}
           />
           <Service
             progress={progress}
             reduced={reduced}
             index={1}
             count={SERVICES.length}
             className="right-[6%] md:right-[10%]"
             service={SERVICES[1]}
           />
           <Service
             progress={progress}
             reduced={reduced}
             index={2}
             count={SERVICES.length}
             className="left-[8%] md:left-[14%]"
             service={SERVICES[2]}
           />
           <Service
             progress={progress}
             reduced={reduced}
             index={3}
             count={SERVICES.length}
             className="right-[7%] md:right-[11%]"
             service={SERVICES[3]}
           />
           <Service
             progress={progress}
             reduced={reduced}
             index={4}
             count={SERVICES.length}
             className="left-1/2 -translate-x-1/2"
             service={SERVICES[4]}
           /> */}
         </div>
      )}
    </HeroScrub>
  );
}