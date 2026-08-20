import { useEffect, useRef } from "react";
import { VideoPanel } from "@/components/common/VideoPanel";
import { cn } from "@/lib/utils";

/** Maximum pixels the backdrop shifts from centre at the edges of the viewport. */
const PARALLAX_RANGE = 18;

/**
 * Fixed, blurred spine animation used as the page backdrop.
 *
 * Three layers of motion, deliberately understated: the clip's own 360° spin, a
 * slow scale drift for depth, and a pointer parallax that trails the cursor.
 * `Spin.mp4` is cut from the unique half of the source footage (the original
 * boomerangs: it sweeps out, then replays that sweep backwards) with its wrap
 * point cross-dissolved, so the spin never reverses direction. A plain forward
 * loop is therefore seamless and one-directional.
 * Parallax is written straight to the node's transform rather than through
 * state — a re-render per mousemove would be far more expensive than the effect
 * is worth. Pointer tracking is skipped entirely when the user has asked for
 * reduced motion.
 *
 * @param {{ src?: string, className?: string }} props
 */
export function SpineBackdrop({ src = "/media/Spin.mp4", className }) {
  const parallaxRef = useRef(null);

  useEffect(() => {
    const node = parallaxRef.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    let frame = null;

    const onPointerMove = (event) => {
      if (frame !== null) return; // coalesce to one write per frame
      frame = requestAnimationFrame(() => {
        frame = null;
        const x = (event.clientX / window.innerWidth - 0.5) * 2;
        const y = (event.clientY / window.innerHeight - 0.5) * 2;
        node.style.transform = `translate3d(${x * PARALLAX_RANGE}px, ${
          y * PARALLAX_RANGE
        }px, 0)`;
      });
    };

    const onPointerLeave = () => {
      node.style.transform = "translate3d(0, 0, 0)";
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden",
        className
      )}
    >
      {/* Faint lift behind the spine so it sits in space rather than on black. */}
      <div className="absolute h-[70vh] w-[70vh] rounded-full bg-ash-500/10 blur-[120px]" />

      {/* Outer node carries the pointer parallax… */}
      <div
        ref={parallaxRef}
        className="transition-transform duration-500 ease-out will-change-transform"
      >
        {/* …inner node the depth drift, so the two transforms don't fight. */}
        <div className="motion-safe:animate-drift">
          <VideoPanel
            src={src}
            bare
            pingPong={false}
            className={cn(
              "h-[100vh] w-[min(96vw,1200px)] opacity-60 blur-[5px]",
              "[mask-image:radial-gradient(closest-side,black_65%,transparent_100%)]",
              "[-webkit-mask-image:radial-gradient(closest-side,black_65%,transparent_100%)]"
            )}
          />
        </div>
      </div>

      <div className="absolute inset-0 bg-black/35" />
    </div>
  );
}
