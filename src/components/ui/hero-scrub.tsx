"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

type HeroScrubProps = {
  id?: string;
  frameCount?: number;
  frameUrl: (index: number) => string;
  titleTop: string;
  titleBottom: string;
  accentHex?: string;
  titleMotion?: (progress: number) => {
    eyebrow?: CSSProperties;
    top?: CSSProperties;
    bottom?: CSSProperties;
  };
  children?: ReactNode | ((progress: number) => ReactNode);
};

type FrameEntry = {
  img: HTMLImageElement | null;
  loaded: boolean;
  decoding: boolean;
  attempts: number;
};

const BUFFER = 24;
const INITIAL_PRELOAD = 30;
const MAX_ATTEMPTS = 3;

function subscribeReduced(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HeroScrub({
  id,
  frameCount = 300,
  frameUrl,
  titleMotion,
  children,
}: HeroScrubProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef(0);
  const lastDrawnIdxRef = useRef(-1);
  const cacheRef = useRef<FrameEntry[]>([]);
  const frameIdxRef = useRef(0);
  const targetIdxRef = useRef(0);
  const frameNumRef = useRef<HTMLSpanElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const scrollHintRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef(0);
  const loadedCountRef = useRef(0);
  const readyRef = useRef(false);
  const scrollLockedRef = useRef(true);

  const [loaded, setLoaded] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);

  const needsProgressState =
    typeof children === "function" || titleMotion !== undefined;
  const reduced = useSyncExternalStore(
    subscribeReduced,
    getReducedSnapshot,
    () => false
  );

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const entry = cacheRef.current[index];
    if (!entry || !entry.img || !entry.loaded) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(entry.img, 0, 0, canvas.width, canvas.height);
  }, []);

  const isWindowReady = useCallback(
    (idx: number) => {
      const cache = cacheRef.current;
      const min = Math.max(0, idx - BUFFER);
      const max = Math.min(frameCount - 1, idx + BUFFER);
      for (let i = min; i <= max; i++) {
        const entry = cache[i];
        if (!entry || !entry.loaded) return false;
      }
      return true;
    },
    [frameCount]
  );

  const loadedRafRef = useRef(0);
  const bumpLoaded = useCallback(() => {
    loadedCountRef.current += 1;
    if (loadedRafRef.current) return;
    loadedRafRef.current = requestAnimationFrame(() => {
      loadedRafRef.current = 0;
      setLoaded(loadedCountRef.current);
    });
  }, []);

  const loadFrame = useCallback(
    async (i: number) => {
      const cache = cacheRef.current;
      if (!cache[i])
        cache[i] = { img: null, loaded: false, decoding: false, attempts: 0 };
      const entry = cache[i];
      if (entry.loaded || entry.img || entry.decoding) return;
      if (entry.attempts >= MAX_ATTEMPTS) return;

      entry.decoding = true;
      entry.attempts += 1;
      const img = new window.Image();
      img.decoding = "async";
      entry.img = img;

      try {
        img.src = frameUrl(i);
        await img.decode();
        if (cacheRef.current[i] !== entry) return;
        entry.loaded = true;
        entry.decoding = false;
        bumpLoaded();

        if (!readyRef.current && isWindowReady(frameIdxRef.current)) {
          readyRef.current = true;
        }

        if (i === frameIdxRef.current) drawFrame(i);
      } catch (err) {
        if (cacheRef.current[i] !== entry) return;
        console.warn(
          `[hero] frame FAILED ${i} ${frameUrl(i)} attempt ${entry.attempts}/${MAX_ATTEMPTS}:`,
          err
        );
        entry.decoding = false;
        entry.img = null;
        entry.loaded = false;
        if (entry.attempts < MAX_ATTEMPTS) {
          window.setTimeout(() => loadFrame(i), 500 * entry.attempts);
        } else {
          setFailedCount((c) => c + 1);
        }
      }
    },
    [drawFrame, isWindowReady, frameUrl, bumpLoaded, frameCount]
  );

  const requestWindow = useCallback(
    (idx: number, radius = BUFFER) => {
      const center = Math.round(idx);
      const min = Math.max(0, center - radius);
      const max = Math.min(frameCount - 1, center + radius);
      for (let i = min; i <= max; i++) loadFrame(i);

      if (scrollLockedRef.current || loadedCountRef.current >= frameCount)
        return;

      const keepMin = Math.max(0, center - BUFFER * 2);
      const keepMax = Math.min(frameCount - 1, center + BUFFER * 2);
      for (let i = 0; i < frameCount; i++) {
        if (i >= keepMin && i <= keepMax) continue;
        const entry = cacheRef.current[i];
        if (entry && entry.img) {
          entry.img.src = "";
          entry.img = null;
          entry.loaded = false;
          entry.decoding = false;
        }
      }
    },
    [loadFrame, frameCount]
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const f = Math.min(1, 1280 / vw, 720 / vh, dpr);
    canvas.width = Math.max(1, Math.round(vw * f));
    canvas.height = Math.max(1, Math.round(vh * f));
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctxRef.current = canvas.getContext("2d");
    drawFrame(frameIdxRef.current);
  }, [drawFrame]);

  useEffect(() => {
    if (reduced) {
      setIsReady(true);
      scrollLockedRef.current = false;
      document.body.style.overflow = "";
      return;
    }

    cacheRef.current = Array.from({ length: frameCount }, () => ({
      img: null,
      loaded: false,
      decoding: false,
      attempts: 0,
    }));
    loadedCountRef.current = 0;
    readyRef.current = false;
    lastDrawnIdxRef.current = -1;
    targetIdxRef.current = 0;
    frameIdxRef.current = 0;
    setLoaded(0);
    setFailedCount(0);
    setIsReady(false);

    document.body.style.overflow = "hidden";
    scrollLockedRef.current = true;

    for (let i = 0; i < Math.min(INITIAL_PRELOAD, frameCount); i++) {
      loadFrame(i);
    }

    resizeCanvas();

    const scope = sectionRef.current;
    if (!scope) return;

    let ctx: { revert: () => void } | null = null;
    let progressRaf = 0;
    let idleTimer = 0;
    let cancelled = false;

    const setHeaderVar = () => {
      const nav = document.querySelector("header nav");
      const h = nav ? nav.getBoundingClientRect().height : 72;
      const el = sectionRef.current;
      if (el) el.style.setProperty("--header-h", `${Math.round(h)}px`);
    };

    setHeaderVar();

    // Single RAF loop - interpolation + drawing
    const animationLoop = () => {
      if (cancelled) return;

      frameIdxRef.current += (targetIdxRef.current - frameIdxRef.current) * 0.35;
      if (Math.abs(targetIdxRef.current - frameIdxRef.current) < 0.5) {
        frameIdxRef.current = targetIdxRef.current;
      }

      const idx = Math.round(frameIdxRef.current);
      if (idx !== lastDrawnIdxRef.current) {
        lastDrawnIdxRef.current = idx;
        drawFrame(idx);
      }

      rafRef.current = requestAnimationFrame(animationLoop);
    };
    rafRef.current = requestAnimationFrame(animationLoop);

    let preloadTimer = 0;
    const preloadAll = () => {
      const cache = cacheRef.current;
      const queue: number[] = [];
      for (let i = 0; i < frameCount; i++) {
        const e = cache[i];
        if (e && !e.loaded && !e.img && !e.decoding) queue.push(i);
      }
      let cursor = 0;
      const step = () => {
        if (cancelled) return;
        const end = Math.min(queue.length, cursor + 8);
        while (cursor < end) {
          loadFrame(queue[cursor]);
          cursor++;
        }
        if (cursor < queue.length) preloadTimer = window.setTimeout(step, 80);
      };
      step();
    };
    const preloadDelay = window.setTimeout(preloadAll, 300);

    const onResize = () => {
      resizeCanvas();
      setHeaderVar();
    };
    window.addEventListener("resize", onResize);

    const initScrollTrigger = async () => {
      if (cancelled) return;
      const [{ default: gsap }, { default: ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const frameProxy = { current: 0 };

      const updateHud = (p: number) => {
        const bar = progressBarRef.current;
        if (bar) bar.style.width = `${p * 100}%`;
        const hint = scrollHintRef.current;
        if (hint) hint.style.opacity = String(Math.max(0, 1 - p));
      };

      const scheduleProgress = (p: number) => {
        progressRef.current = p;
        if (!needsProgressState) return;
        if (progressRaf) return;
        progressRaf = requestAnimationFrame(() => {
          progressRaf = 0;
          setProgress(progressRef.current);
        });
      };

      const touchWindow = (idx: number) => {
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          requestWindow(frameIdxRef.current, BUFFER);
        }, 200);
        requestWindow(idx, 1);
      };

      ctx = gsap.context(() => {
        const syncFrameFromProxy = () => {
          targetIdxRef.current = Math.round(frameProxy.current);
          const span = frameNumRef.current;
          if (span)
            span.textContent = `Frame ${String(targetIdxRef.current + 1).padStart(3, "0")} / ${String(frameCount).padStart(3, "0")}`;
        };

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.5,
            onUpdate: (self: { progress: number }) => {
              syncFrameFromProxy();
              const p = self.progress;
              updateHud(p);
              scheduleProgress(p);
              touchWindow(targetIdxRef.current);
            },
          },
        });

        tl.to(
          frameProxy,
          {
            current: frameCount - 1,
            ease: "none",
            duration: 1,
            // The scrub tween keeps settling after scroll events stop;
            // keep target frame in sync with it, not just with onUpdate.
            onUpdate: syncFrameFromProxy,
          },
          0
        );
      }, scope);
      // Cleanup may have run while the module was loading; revert immediately
      // in that case (otherwise the ScrollTrigger leaks).
      if (cancelled && ctx) {
        ctx.revert();
        ctx = null;
      }
    };
    initScrollTrigger();

    const checkReady = () => {
      if (loadedCountRef.current >= frameCount && scrollLockedRef.current) {
        scrollLockedRef.current = false;
        document.body.style.overflow = "";
        setIsReady(true);
        // Explicitly draw first frame when ready
        drawFrame(0);
      }
    };
    const readyInterval = window.setInterval(checkReady, 100);

    return () => {
      cancelled = true;
      cancelAnimationFrame(progressRaf);
      cancelAnimationFrame(loadedRafRef.current);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(idleTimer);
      clearTimeout(preloadTimer);
      clearTimeout(preloadDelay);
      clearInterval(readyInterval);
      window.removeEventListener("resize", onResize);
      if (ctx) ctx.revert();
      cacheRef.current.forEach((entry) => {
        if (entry?.img) entry.img.src = "";
      });
    };
  }, [
    reduced,
    frameCount,
    requestWindow,
    resizeCanvas,
    drawFrame,
    needsProgressState,
    loadFrame,
  ]);

  const loadPct = Math.round((loaded / frameCount) * 100);

  return (
    <>
      {/* Loading overlay — sibling of the section so the section's
          pre-ready opacity gate cannot hide it. */}
      {!isReady && !reduced && (
        <div
          className="fixed inset-0 z-[9999] bg-ink transition-opacity duration-700 ease-in-out"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(251,191,36,0.08)_0%,rgba(0,0,0,0)_70%)]" />
          {/* Subtly decorative thin lines */}
          <div className="pointer-events-none absolute top-0 left-8 h-px w-24 bg-gradient-to-r from-gold/30 to-transparent md:left-10" />
          <div className="pointer-events-none absolute top-0 right-8 h-px w-24 bg-gradient-to-l from-gold/30 to-transparent md:right-10" />
          <div className="pointer-events-none absolute left-0 top-8 h-24 w-px bg-gradient-to-b from-gold/30 to-transparent md:top-10" />
          <div className="pointer-events-none absolute right-0 top-8 h-24 w-px bg-gradient-to-b from-gold/30 to-transparent md:top-10" />
          <div className="pointer-events-none absolute bottom-0 left-8 h-px w-24 bg-gradient-to-r from-gold/30 to-transparent md:left-10" />
          <div className="pointer-events-none absolute bottom-0 right-8 h-px w-24 bg-gradient-to-l from-gold/30 to-transparent md:right-10" />
          <div className="pointer-events-none absolute right-0 bottom-8 h-24 w-px bg-gradient-to-t from-gold/30 to-transparent md:bottom-10" />
          <div className="pointer-events-none absolute left-0 bottom-8 h-24 w-px bg-gradient-to-t from-gold/30 to-transparent md:bottom-10" />
          {/* Subtly curved gold arcs */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.06] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
               style={{ background: "radial-gradient(120% 80% at 50% 20%, rgba(251,191,36,0.10) 0%, transparent 70%)" }} />
          {/* Very subtle grain/noise (inexpensive CSS) */}
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04] mix-blend-soft-light">
            <filter id="loader-noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" stitchTiles="stitch" />
            </filter>
            <rect width="100%" height="100%" filter="url(#loader-noise)" />
          </svg>
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <div className="relative mb-10 md:mb-12">
              <div className="absolute inset-0 rounded-full blur-[20px] opacity-40" style={{ background: "radial-gradient(circle, rgba(251,191,36,0.55) 0%, transparent 70%)" }} />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-gold/45 bg-gradient-to-b from-gold/12 to-transparent shadow-[0_0_140px_rgba(251,191,36,0.16)] md:h-28 md:w-28">
                <span className="font-serif text-5xl md:text-6xl font-medium leading-none text-gold [text-shadow:0_0_70px_rgba(251,191,36,0.55)]">K</span>
              </div>
            </div>
            <div className="mb-6 text-xs uppercase tracking-[0.5em] text-fg/55 font-mono md:mb-8">INITIALIZING EXPERIENCE</div>
            <div className="mb-6 text-2xl md:text-3xl tracking-[0.25em] text-gold font-mono [text-shadow:0_0_45px_rgba(251,191,36,0.28)]">
              {String(loaded).padStart(3, "0")} / {String(frameCount).padStart(3, "0")}
            </div>
            <div className="mb-8 h-px w-[80vw] max-w-[380px] bg-fg/10 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-gold via-amber-200 to-gold transition-[width] duration-300 ease-out" style={{ width: `${loadPct}%`, boxShadow: "0 0 22px rgba(251,191,36,0.55)" }} />
            </div>
            <div className="mb-10 text-[10px] uppercase tracking-[0.5em] text-fg/45 font-mono md:mb-12">LOADING FRAMES...</div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-fg/35 font-mono px-4">
              <div className="flex items-center gap-2"><span>FRAME CACHE</span><span className="text-fg/60">{String(loaded).padStart(3, "0")} / {String(frameCount).padStart(3, "0")}</span></div>
              <div className="flex items-center gap-2"><span>ASSET LOADING</span><span className="text-fg/60">{loadPct}%</span></div>
              <div className="flex items-center gap-2"><span>CANVAS</span><span className="text-fg/60">READY</span></div>
              <div className="flex items-center gap-2"><span>RENDER ENGINE</span><span className="text-fg/60">READY</span></div>
            </div>
            {failedCount > 0 && (
              <div className="mt-4 text-[10px] uppercase tracking-[0.3em] text-red-400/85 font-mono">{failedCount} frame{failedCount === 1 ? "" : "s"} failed</div>
            )}
          </div>
        </div>
      )}
      <section
        ref={sectionRef}
        id={id}
        className={
          reduced
            ? "relative h-screen bg-ink"
            : "relative h-[420vh] bg-ink"
        }
        style={{ opacity: isReady || reduced ? 1 : 0, transition: "opacity 300ms ease-out", paddingTop: "var(--header-h, 72px)" }}
      >
        <div
          ref={pinRef}
          className="sticky top-0 h-screen overflow-hidden"
          style={{ marginTop: "calc(-1 * var(--header-h, 72px))" }}
        >
        <div className="absolute inset-0 bg-ink" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(251,191,36,0.1), rgba(251,191,36,0.03) 38%, transparent 60%)",
          }}
        />

        <div ref={cardRef} className="absolute inset-0 overflow-hidden">
          {reduced ? (
            <Image
              src={frameUrl(0)}
              alt=""
              fill
              sizes="100vw"
              priority
              className="object-cover opacity-50"
            />
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 block h-full w-full"
              style={{ background: "var(--ink)" }}
            />
          )}

          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(5,6,10,0.8) 100%)",
            }}
          />
          <div className="noise-overlay absolute inset-0 opacity-[0.04]" />

          {/* ============================================================
              Title block (commented out on request) — "Portfolio" eyebrow
              and KANHA JATTHAP heading.
          ============================================================ */}
          {/* <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span
              className="eyebrow mb-6"
              style={titleMotion ? titleMotion(progress).eyebrow : undefined}
            >
              Portfolio
            </span>
            <h1
              className="font-bold leading-[0.9] tracking-[-0.03em]"
              style={{
                fontFamily: "var(--font-playfair), serif",
                fontSize: "clamp(2.25rem, 5.5vw, 6.5rem)",
              }}
            >
              <span
                className="block text-fg"
                style={{
                  textShadow: "0 10px 60px rgba(0,0,0,0.65)",
                  ...(titleMotion ? titleMotion(progress).top : {}),
                }}
              >
                {titleTop}
              </span>
              <span
                className="block italic"
                style={{
                  color: accentHex,
                  ...(titleMotion ? titleMotion(progress).bottom : {}),
                }}
              >
                {titleBottom}
              </span>
            </h1>
          </div> */}
        </div>

        {/* Fixed overlay content - only visible when ready */}
        {(isReady || reduced) && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {typeof children === "function" ? children(progress) : children}
          </div>
        )}

        {/* HUD */}
        <div
          className="absolute inset-x-0 bottom-8 z-20 flex items-center justify-between px-6 md:px-10"
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "10px",
            letterSpacing: "0.3em",
            color: "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          <span ref={frameNumRef}>
            Frame 001 / {String(frameCount).padStart(3, "0")}
          </span>

          <div
            className="absolute left-1/2 h-px w-40 -translate-x-1/2 overflow-hidden md:w-60"
            style={{ background: "var(--line)" }}
          >
            <div
              ref={progressBarRef}
              className="h-full"
              style={{
                width: 0,
                background: "linear-gradient(90deg, #fbbf24, #fef3c7)",
                boxShadow: "0 0 10px rgba(251,191,36,0.9)",
              }}
            />
          </div>

          <span ref={scrollHintRef} className="flex items-center gap-2">
            Scroll
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M1 1 L5 5 L9 1"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </span>
        </div>
      </div>
      </section>
    </>
  );
}