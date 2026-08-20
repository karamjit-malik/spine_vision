import { useState } from "react";
import { Sparkles } from "lucide-react";
import { explainCondition } from "@/api/diagnosis";
import { AuthedImage } from "@/components/common/AuthedImage";
import { Badge } from "@/components/ui/Badge";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { Modal } from "@/components/ui/Modal";
import { titleize } from "@/lib/utils";

/**
 * Grid of diagnostic overlays. Clicking a tile opens the full-size overlay with
 * the measurements behind it — the numbers the report was written from.
 *
 * @param {{ heatmaps: Array<{
 *   condition: string, imageUrl: string, severity: string, confidence?: number,
 *   summary?: string, metrics?: object, caveats?: string[]
 * }> }} props
 */
export function HeatmapGallery({ heatmaps = [], scanId }) {
  const [selected, setSelected] = useState(null);

  if (!heatmaps.length) {
    return (
      <p className="py-6 text-center text-xs text-ash-500">
        Diagnostic overlays appear here once the scripts finish.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {heatmaps.map((heatmap) => (
          <button
            key={heatmap.condition}
            onClick={() => setSelected(heatmap)}
            className="group overflow-hidden rounded-lg border border-ink-600 bg-ink-900 text-left transition-colors hover:border-ink-500"
          >
            <div className="aspect-[4/5] overflow-hidden bg-black">
              <AuthedImage
                src={heatmap.imageUrl}
                alt={`${titleize(heatmap.condition)} diagnostic overlay`}
                loading="lazy"
                className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
              />
            </div>
            <div className="min-w-0 space-y-1.5 p-2.5">
              {/* truncate + min-w-0 so a long condition name shortens instead of
                  pushing the badge and quality figure out of a narrow tile. */}
              <p className="truncate text-xs text-ash-200">{titleize(heatmap.condition)}</p>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <Badge severity={heatmap.severity}>{heatmap.severity}</Badge>
                {typeof heatmap.confidence === "number" && (
                  <span
                    className="shrink-0 font-mono text-[0.65rem] text-ash-500"
                    title="Measurement quality — how reliable the geometry was, not the probability of a condition"
                  >
                    q {(heatmap.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {heatmap.summary && (
                <p className="line-clamp-2 text-[0.7rem] leading-snug text-ash-500">
                  {heatmap.summary}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? titleize(selected.condition) : ""}
      >
        {selected && <HeatmapDetail heatmap={selected} scanId={scanId} />}
      </Modal>
    </>
  );
}

function HeatmapDetail({ heatmap, scanId }) {
  const perLevel = heatmap.metrics?.perLevel;
  const audience = useDiagnosisStore((state) => state.audience);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);

  const explain = async () => {
    if (loading || explanation) return;
    setLoading(true);
    try {
      const result = await explainCondition(scanId, heatmap.condition, audience);
      setExplanation(result.explanation);
    } catch (error) {
      setExplanation(
        error.response?.data?.message ??
          "Could not load an explanation. Check the server has an LLM key configured."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <AuthedImage
        src={heatmap.imageUrl}
        alt={`${titleize(heatmap.condition)} full size overlay`}
        className="mx-auto max-h-[55vh] object-contain"
      />

      <div className="flex items-center justify-center gap-3">
        <Badge severity={heatmap.severity}>{heatmap.severity}</Badge>
        {typeof heatmap.confidence === "number" && (
          <span
            className="font-mono text-xs text-ash-500"
            title="How reliable the geometry was, not the probability of a condition"
          >
            measurement quality {(heatmap.confidence * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {heatmap.summary && (
        <p className="text-sm leading-relaxed text-ash-200">{heatmap.summary}</p>
      )}

      {/* The measured summary above is always shown; this adds a plain-language
          reading of what the drawn marks mean, on demand so it costs nothing
          for anyone who does not ask. */}
      {scanId && !explanation && (
        <button
          onClick={explain}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs text-ash-400 transition-colors hover:border-ink-500 hover:text-ash-100 disabled:opacity-50"
        >
          <Sparkles size={13} />
          {loading ? "Reading the overlay…" : "What am I looking at?"}
        </button>
      )}

      {explanation && (
        <p className="rounded-lg border border-ink-600 px-3 py-2.5 text-sm leading-relaxed text-ash-300">
          {explanation}
        </p>
      )}

      {perLevel?.length > 0 && <PerLevelTable rows={perLevel} />}

      {heatmap.metrics?.gradingScale && (
        <p className="text-xs text-ash-500">
          <span className="text-ash-400">Grading scale: </span>
          {formatValue(heatmap.metrics.gradingScale)}
        </p>
      )}

      {heatmap.caveats?.length > 0 && (
        <details className="rounded-md border border-ink-600 bg-ink-900 p-3">
          <summary className="cursor-pointer text-xs text-ash-400">
            How this was measured ({heatmap.caveats.length} limitations)
          </summary>
          <ul className="mt-2 space-y-1.5 pl-4 text-[0.7rem] leading-snug text-ash-500">
            {heatmap.caveats.map((caveat) => (
              <li key={caveat} className="list-disc">
                {caveat}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Per-vertebra or per-pair measurements, keyed off whatever the script emitted. */
function PerLevelTable({ rows }) {
  const columns = Object.keys(rows[0]).filter((key) => key !== "severity");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-ink-600 text-ash-500">
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-2 py-1.5 font-normal">
                {humanize(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.level} className="border-b border-ink-700/60 last:border-0">
              {columns.map((column) => (
                <td
                  key={column}
                  className="whitespace-nowrap px-2 py-1.5 font-mono text-ash-300"
                >
                  {formatValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const humanize = (key) =>
  key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()).trim();

function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${entry}`)
      .join("; ");
  }
  return String(value);
}
