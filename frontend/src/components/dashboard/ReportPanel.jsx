import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { streamReport } from "@/api/diagnosis";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { cn } from "@/lib/utils";

const AUDIENCES = [
  { id: "patient", label: "Patient", hint: "Plain language, jargon explained" },
  { id: "clinician", label: "Clinician", hint: "Terse, standard terminology" },
];

/** Greyscale markdown renderers so the report matches the dark shell. */
const components = {
  h1: (props) => <h1 className="mb-3 text-lg font-semibold text-ash-100" {...props} />,
  h2: (props) => (
    <h2
      className="mb-2 mt-6 border-b border-ink-600 pb-1 text-sm font-semibold uppercase tracking-[0.14em] text-ash-200"
      {...props}
    />
  ),
  h3: (props) => <h3 className="mb-1 mt-4 text-sm font-medium text-ash-200" {...props} />,
  p: (props) => <p className="mb-3 text-sm leading-relaxed text-ash-300" {...props} />,
  ul: (props) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-ash-300" {...props} />,
  ol: (props) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-ash-300" {...props} />,
  strong: (props) => <strong className="font-semibold text-ash-100" {...props} />,
  hr: () => <hr className="my-5 border-ink-600" />,
  em: (props) => <em className="text-ash-500" {...props} />,
  table: (props) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-ink-600">
      <table className="w-full text-left text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-ink-800" {...props} />,
  th: (props) => (
    <th
      className="border-b border-ink-600 px-3 py-2 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-ash-400"
      {...props}
    />
  ),
  td: (props) => <td className="border-b border-ink-700 px-3 py-2 text-ash-300" {...props} />,
  code: (props) => (
    <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ash-200" {...props} />
  ),
};

/**
 * Renders the report, switches it between audiences, and exports it to PDF.
 *
 * The patient report already arrives with the scan result, so the default view
 * costs nothing extra. Switching to the clinician view streams a fresh one and
 * keeps it for the rest of the session; the server caches it too, so coming
 * back later is free rather than a second paid generation.
 *
 * @param {{ markdown?: string, scanId?: string }} props
 */
export function ReportPanel({ markdown, scanId }) {
  const contentRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const audience = useDiagnosisStore((state) => state.audience);
  const setAudience = useDiagnosisStore((state) => state.setAudience);
  const [streaming, setStreaming] = useState(false);

  // Generated variants, tagged with the scan they belong to. Tagging rather
  // than clearing on scanId change avoids the render where a previous scan's
  // clinician report is still in state under the new scan's id.
  const [cache, setCache] = useState({ scanId: null, byAudience: {} });
  const generated = cache.scanId === scanId ? cache.byAudience : {};

  // The patient report is whatever the pipeline already wrote, so that view is
  // never a second paid call — only other audiences are generated on demand.
  const shown = audience === "patient" ? markdown ?? "" : generated[audience] ?? "";

  useEffect(() => {
    // `markdown` is the signal that the scan finished: the panel is mounted as
    // soon as a scan is active, and asking for a report before the pipeline has
    // written one is a 400.
    if (!scanId || !markdown) return;
    if (audience === "patient") return;
    if (generated[audience] !== undefined || streaming) return;

    const controller = new AbortController();
    setStreaming(true);

    const append = (piece) =>
      setCache((prior) => {
        const base = prior.scanId === scanId ? prior.byAudience : {};
        return {
          scanId,
          byAudience: { ...base, [audience]: (base[audience] ?? "") + piece },
        };
      });

    append("");

    streamReport(scanId, audience, append, { signal: controller.signal })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(error.message ?? "Could not generate that view");
        // Drop the empty placeholder so the view can be retried, and fall back
        // to the report we already have.
        setCache((prior) => {
          if (prior.scanId !== scanId) return prior;
          const byAudience = { ...prior.byAudience };
          delete byAudience[audience];
          return { scanId, byAudience };
        });
        setAudience("patient");
      })
      .finally(() => setStreaming(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, scanId, markdown]);

  const downloadPdf = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      // html2pdf pulls in a large bundle — load it only on demand.
      const { default: html2pdf } = await import("html2pdf.js");
      await html2pdf()
        .set({
          margin: 12,
          filename: `spine-vision-report-${Date.now()}.pdf`,
          html2canvas: { scale: 2, backgroundColor: "#000000" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(contentRef.current)
        .save();
    } catch (error) {
      toast.error("PDF export failed");
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  if (!markdown) {
    return (
      <p className="py-6 text-center text-xs text-ash-500">
        The medical report is generated after diagnosis completes.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Report audience"
          className="flex items-center gap-1 rounded-lg border border-ink-600 p-0.5"
        >
          {AUDIENCES.map(({ id, label, hint }) => (
            <button
              key={id}
              onClick={() => setAudience(id)}
              disabled={streaming}
              title={hint}
              aria-pressed={audience === id}
              className={cn(
                "rounded px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                audience === id
                  ? "bg-ink-700 text-ash-100"
                  : "text-ash-400 hover:text-ash-100"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Button variant="ghost" onClick={downloadPdf} disabled={exporting || streaming} className="px-3 py-1.5 text-xs">
          <Download size={13} />
          {exporting ? "Preparing…" : "Download PDF"}
        </Button>
      </div>

      <article ref={contentRef} className="rounded-lg bg-black p-1">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {shown}
        </Markdown>
        {streaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-ash-400 align-text-bottom" />
        )}
      </article>
    </div>
  );
}
