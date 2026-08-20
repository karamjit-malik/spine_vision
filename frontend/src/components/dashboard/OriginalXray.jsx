import { useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Layers, Minus, Plus, RefreshCw } from "lucide-react";
import { AuthedImage } from "@/components/common/AuthedImage";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { cn } from "@/lib/utils";
import { parseMaskVertebrae } from "@/lib/mask";

/** Draw the segmentation polygons over the X-ray on a matching-size canvas. */
function MaskOverlay({ maskJson, size, naturalSize }) {
  const canvasRef = useRef(null);

  // Whatever format the mask arrived in, this yields 0-1 coordinates.
  const vertebrae = useMemo(
    () => parseMaskVertebrae(maskJson, naturalSize),
    [maskJson, naturalSize]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !vertebrae.length || !size.width) return;

    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    vertebrae.forEach(({ label, polygon }) => {
      ctx.beginPath();
      polygon.forEach(([x, y], i) => {
        const px = x * canvas.width;
        const py = y * canvas.height;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(220, 220, 220, 0.14)";
      ctx.strokeStyle = "rgba(230, 230, 230, 0.75)";
      ctx.lineWidth = 1.25;
      ctx.fill();
      ctx.stroke();

      // Label to the left of the body's leftmost point, vertically centred.
      const left = Math.min(...polygon.map(([x]) => x));
      const middle = polygon.reduce((total, [, y]) => total + y, 0) / polygon.length;
      ctx.fillStyle = "rgba(240, 240, 240, 0.9)";
      ctx.font = "11px ui-sans-serif, system-ui";
      ctx.textAlign = "right";
      ctx.fillText(label, left * canvas.width - 6, middle * canvas.height + 4);
    });
  }, [vertebrae, size]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    />
  );
}

/**
 * Zoomable / pannable X-ray viewer with a toggleable mask overlay.
 * @param {{ src: string, maskJson?: object }} props
 */
export function OriginalXray({ src, maskJson }) {
  const { showMask, toggleMask } = useDiagnosisStore();
  const imgRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // A COCO mask carries absolute pixel coordinates; without the source
  // dimensions there is nothing to scale them against.
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  const measure = () => {
    const img = imgRef.current;
    if (!img) return;
    setSize({ width: img.clientWidth, height: img.clientHeight });
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <TransformWrapper doubleClick={{ disabled: true }} minScale={0.6} maxScale={6}>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={toggleMask}
              className={cn(
                "btn px-3 py-1.5 text-xs",
                showMask
                  ? "bg-ink-700 text-ash-100"
                  : "border border-ink-600 text-ash-400 hover:text-ash-100"
              )}
              aria-pressed={showMask}
            >
              <Layers size={13} />
              Mask overlay
            </button>

            <div className="flex items-center gap-1">
              {[
                { icon: Minus, action: () => zoomOut(), label: "Zoom out" },
                { icon: Plus, action: () => zoomIn(), label: "Zoom in" },
                { icon: RefreshCw, action: () => resetTransform(), label: "Reset view" },
              ].map(({ icon: Icon, action, label }) => (
                <button
                  key={label}
                  onClick={action}
                  aria-label={label}
                  className="rounded border border-ink-600 p-1.5 text-ash-400 hover:border-ink-500 hover:text-ash-100"
                >
                  <Icon size={13} />
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-ink-600 bg-black">
            <TransformComponent
              wrapperClass="!w-full"
              contentClass="!w-full flex items-center justify-center"
            >
              <div className="relative">
                <AuthedImage
                  ref={imgRef}
                  src={src}
                  onLoad={measure}
                  alt="Uploaded lateral-view lumbar X-ray"
                  className="max-h-[520px] w-auto select-none object-contain"
                />
                {showMask && (
                  <MaskOverlay
                    maskJson={maskJson}
                    size={size}
                    naturalSize={naturalSize}
                  />
                )}
              </div>
            </TransformComponent>
          </div>
        </div>
      )}
    </TransformWrapper>
  );
}
