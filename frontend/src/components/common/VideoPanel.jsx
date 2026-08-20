import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * Plays a local MP4 with greyscale custom controls.
 *
 * Drop the file into `frontend/public/media/` and pass its public path, e.g.
 * `<VideoPanel src="/media/Final.mp4" />`. If the file is not there yet the
 * panel renders a placeholder instead of a broken player.
 *
 * With `pingPong` on, playback boomerangs forever: forward to the end, then
 * back to the start, then forward again. Browsers ignore a negative
 * `playbackRate`, so the reverse leg steps `currentTime` backwards frame by
 * frame — and every one of those backward seeks decodes from the nearest
 * preceding keyframe. On a clip with sparse keyframes the rewind therefore
 * lurches in multi-second jumps. Only turn this on for footage encoded with a
 * short GOP (`ffmpeg -g 1`), and prefer a plain forward loop for anything that
 * already ends where it starts.
 *
 * Pass `bare` to drop the card, heading and control bar so the clip reads as a
 * decorative animation rather than a video the user is meant to operate.
 *
 * @param {{ src?: string, title?: string, poster?: string, pingPong?: boolean, autoPlay?: boolean, bare?: boolean, className?: string }} props
 */
export function VideoPanel({
  src = "/media/Final.mp4",
  title = "Reference Animation",
  poster,
  pingPong = false,
  autoPlay = true,
  bare = false,
  className,
}) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);
  const directionRef = useRef("forward");

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [missing, setMissing] = useState(false);

  const stopReverse = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  }, []);

  /** Walks `currentTime` backwards in real time until we reach the start. */
  const stepBackward = useCallback(
    (timestamp) => {
      const video = videoRef.current;
      if (!video) return;

      const last = lastTsRef.current ?? timestamp;
      lastTsRef.current = timestamp;
      const elapsed = (timestamp - last) / 1000;
      const next = video.currentTime - elapsed;

      if (next <= 0) {
        // Hit the start — flip back to normal forward playback.
        stopReverse();
        directionRef.current = "forward";
        video.currentTime = 0;
        setProgress(0);
        video.play().catch(() => setPlaying(false));
        return;
      }

      video.currentTime = next;
      if (video.duration) setProgress((next / video.duration) * 100);
      rafRef.current = requestAnimationFrame(stepBackward);
    },
    [stopReverse]
  );

  const startReverse = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    directionRef.current = "reverse";
    lastTsRef.current = null;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(stepBackward);
  }, [stepBackward]);

  /** Reaching the end starts the rewind leg instead of stopping. */
  const handleEnded = useCallback(() => {
    if (!pingPong) {
      setPlaying(false);
      return;
    }
    startReverse();
  }, [pingPong, startReverse]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;

    if (directionRef.current === "reverse") {
      if (rafRef.current !== null) {
        stopReverse();
        setPlaying(false);
      } else {
        lastTsRef.current = null;
        rafRef.current = requestAnimationFrame(stepBackward);
        setPlaying(true);
      }
      return;
    }

    if (video.paused) {
      video.play().catch(() => setPlaying(false));
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const restart = () => {
    const video = videoRef.current;
    if (!video) return;
    stopReverse();
    directionRef.current = "forward";
    video.currentTime = 0;
    setProgress(0);
    video.play().catch(() => setPlaying(false));
    setPlaying(true);
  };

  const seek = (event) => {
    const video = videoRef.current;
    if (!video?.duration) return;
    const value = Number(event.target.value);
    video.currentTime = (value / 100) * video.duration;
    lastTsRef.current = null; // don't count the scrub as elapsed reverse time
    setProgress(value);
  };

  // Cancel any in-flight rewind when the panel unmounts or the source changes.
  useEffect(() => stopReverse, [stopReverse, src]);

  const video = (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      // `loop` would swallow the end event the rewind leg depends on.
      loop={!pingPong}
      autoPlay={autoPlay}
      muted={muted}
      playsInline
      preload="auto"
      aria-hidden={bare || undefined}
      onError={() => setMissing(true)}
      onClick={bare ? undefined : toggle}
      onPlay={() => setPlaying(true)}
      onPause={() => {
        if (directionRef.current !== "reverse") setPlaying(false);
      }}
      onEnded={handleEnded}
      onTimeUpdate={(e) => {
        if (directionRef.current === "reverse") return;
        const { currentTime, duration } = e.currentTarget;
        if (duration) setProgress((currentTime / duration) * 100);
      }}
      className={cn(
        "w-full object-contain",
        bare ? "h-full" : "max-h-[420px] cursor-pointer"
      )}
    />
  );

  // Decorative mode: no card, no heading, no transport controls.
  if (bare) {
    if (missing) return null;
    return <div className={className}>{video}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader
        title={title}
        action={
          !missing && (
            <button
              onClick={() => videoRef.current?.requestFullscreen?.()}
              aria-label="Fullscreen"
              className="text-ash-500 hover:text-ash-100"
            >
              <Maximize2 size={14} />
            </button>
          )
        }
      />
      <CardBody className="space-y-3">
        {missing ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-600 text-center">
            <p className="text-sm text-ash-400">No video loaded</p>
            <p className="max-w-xs text-xs text-ash-500">
              Place your MP4 at{" "}
              <code className="font-mono text-ash-400">public{src}</code> and
              reload.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-ink-600 bg-black">
              {video}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggle}
                aria-label={playing ? "Pause" : "Play"}
                className="rounded-full border border-ink-600 p-2 text-ash-300 hover:border-ink-500 hover:text-ash-100"
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={restart}
                aria-label="Restart"
                className="text-ash-500 hover:text-ash-100"
              >
                <RotateCcw size={14} />
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={seek}
                aria-label="Seek"
                className={cn(
                  "h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600",
                  "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
                  "[&::-webkit-slider-thumb]:bg-ash-300"
                )}
              />
              <button
                onClick={() => {
                  setMuted((m) => !m);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
                aria-label={muted ? "Unmute" : "Mute"}
                className="text-ash-500 hover:text-ash-100"
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
