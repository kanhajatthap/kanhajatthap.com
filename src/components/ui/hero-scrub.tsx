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

type FrameEntry = { img: HTMLImageElement | null; loaded: boolean; decoding: boolean };

const BUFFER = 24;
const INITIAL_PRELOAD = 30;

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
  const allLoadedRef = useRef(false);

  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [windowReady, setWindowReady] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const needsProgressState =
    typeof children === "function" || titleMotion !== undefined;
  const reduced = useSyncExternalStore(
    subscribeReduced,
    getReducedSnapshot,
    () => false
  );

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const entry = cacheRef.current[index];
    if (!canvas || !entry || !entry.img || !entry.loaded) return;
    const ctx =
      ctxRef.current ??
      canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;
    ctxRef.current = ctx;

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
      if (!cache[i]) cache[i] = { img: null, loaded: false, decoding: false };
      const entry = cache[i];
      if (entry.loaded || entry.img || entry.decoding) return;

      entry.decoding = true;
      const img = new window.Image();
      img.decoding = "async";
      entry.img = img;

      try {
        img.src = frameUrl(i);
        await img.decode();
        entry.loaded = true;
        entry.decoding = false;
        loadedCountRef.current += 1;
        bumpLoaded();

        if (!readyRef.current && isWindowReady(frameIdxRef.current)) {
          readyRef.current = true;
          setWindowReady(true);
        }

        if (!allLoadedRef.current && loadedCountRef.current >= frameCount) {
          allLoadedRef.current = true;
        }

        if (i === frameIdxRef.current) drawFrame(i);
      } catch {
        entry.decoding = false;
      }
    },
    [drawFrame, isWindowReady, frameUrl, bumpLoaded]
  );

  const requestWindow = useCallback(
    (idx: number, radius = BUFFER) => {
      const min = Math.max(0, idx - radius);
      const max = Math.min(frameCount - 1, idx + radius);
      for (let i = min; i <= max; i++) loadFrame(i);

      if (loadedCountRef.current >= frameCount) return;

      const keepMin = Math.max(0, idx - BUFFER * 2);
      const keepMax = Math.min(frameCount - 1, idx + BUFFER * 2);
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
    ctxRef.current = null;
    drawFrame(frameIdxRef.current);
  }, [drawFrame]);

useEffect(() => {
    if (reduced) {
      setIsReady(true);
      return;
    }

    cacheRef.current = Array.from({ length: frameCount }, () => ({
      img: null,
      loaded: false,
      decoding: false,
    }));

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

    // Main animation loop - handles interpolation and drawing
    const animationLoop = () => {
      if (cancelled) return;
      
      // Smooth interpolation toward target frame
      frameIdxRef.current += (targetIdxRef.current - frameIdxRef.current) * 0.2;
      
      // Draw the current frame
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

    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);

    const initScrollTrigger = async () => {
      if (cancelled) return;
      const [{ default: gsap }, { default: ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
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
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.5,
            onUpdate: (self: { progress: number }) => {
              targetIdxRef.current = Math.round(frameProxy.current);
              const p = self.progress;
              updateHud(p);
              scheduleProgress(p);
              const span = frameNumRef.current;
              if (span)
                span.textContent = String(targetIdxRef.current + 1).padStart(3, "0");
              touchWindow(targetIdxRef.current);
            },
          },
        });

        tl.to(
          frameProxy,
          { current: frameCount - 1, ease: "none", duration: 1 },
          0
        );
      }, scope);
    };
    initScrollTrigger();

    const checkReady = () => {
      if (windowReady && !isReady) {
        setIsReady(true);
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
    windowReady,
    loadFrame,
  ]);

  useEffect(() => {
    if (windowReady && !isReady) {
      setIsReady(true);
    }
  }, [windowReady, isReady]);

  useEffect(() => {
    const interpolate = () => {
      frameIdxRef.current += (targetIdxRef.current - frameIdxRef.current) * 0.35;
      if (Math.abs(targetIdxRef.current - frameIdxRef.current) < 0.5) {
        frameIdxRef.current = targetIdxRef.current;
      }
      const idx = Math.round(frameIdxRef.current);
      if (idx !== lastDrawnIdxRef.current) {
        lastDrawnIdxRef.current = idx;
        drawFrame(idx);
      }
      rafRef.current = requestAnimationFrame(interpolate);
    };
    if (!reduced) {
      rafRef.current = requestAnimationFrame(interpolate);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [reduced, drawFrame]);

  const loadPct = Math.round((loaded / frameCount) * 100);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={
        reduced
          ? "relative h-screen bg-ink"
          : "relative h-[420vh] bg-ink"
      }
      style={{ opacity: isReady || reduced ? 1 : 0, transition: "opacity 300ms ease-out" }}
    >
      <div
        ref={pinRef}
        className="sticky top-0 h-screen overflow-hidden"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-ink" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(251,191,36,0.1), rgba(251,191,36,0.03) 38%, transparent 60%)",
          }}
        />

        {/* Full-screen stage */}
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

        {/* Loading indicator - full screen overlay until ready */}
        {!isReady && !reduced && (
          <div
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink/95 backdrop-blur-sm"
            style={{ transition: "opacity 300ms ease-out" }}
          >
            <div className="text-center">
              <div className="mb-4 h-8 w-8 mx-auto border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              <div className="mb-2 text-sm uppercase tracking-[0.3em] text-fg/60 font-mono">
                Loading Film
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-fg/40 font-mono">
                {loadPct}%
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
