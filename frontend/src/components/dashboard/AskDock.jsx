import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, MessageSquare, Sparkles, X } from "lucide-react";
import { askScan } from "@/api/diagnosis";
import { useDiagnosisStore } from "@/stores/diagnosisStore";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Which level is worst?",
  "What does the height ratio mean?",
  "Why is the slip measurement uncertain?",
];

/**
 * The assistant, docked to the right of the page.
 *
 * Answers come from the server grounded in this scan's stored measurements, so
 * anything that was not measured comes back as "that wasn't measured" rather
 * than a guess. The exchange is deliberately not persisted — it is a reading
 * aid, not part of the medical record — but it is kept while the same scan
 * stays open, so collapsing the dock does not throw the conversation away.
 *
 * @param {{ scanId: string }} props
 */
export function AskDock({ scanId }) {
  const { askOpen, toggleAsk, closeAsk, audience } = useDiagnosisStore();
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState([]);
  const [pending, setPending] = useState(false);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  // A conversation belongs to the scan it was asked about.
  useEffect(() => {
    setThread([]);
    setQuestion("");
  }, [scanId]);

  useEffect(() => {
    if (askOpen) inputRef.current?.focus();
  }, [askOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, pending]);

  // Escape closes the dock, as it does for the image modal.
  useEffect(() => {
    if (!askOpen) return;
    const onKey = (event) => event.key === "Escape" && closeAsk();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen, closeAsk]);

  const submit = async (text) => {
    const asked = (text ?? question).trim();
    if (!asked || pending) return;

    setQuestion("");
    setPending(true);
    setThread((prior) => [...prior, { role: "user", text: asked }]);

    try {
      const { answer } = await askScan(scanId, asked, audience);
      setThread((prior) => [...prior, { role: "assistant", text: answer }]);
    } catch (error) {
      setThread((prior) => [
        ...prior,
        {
          role: "error",
          text:
            error.response?.data?.message ??
            "Could not answer that. Check the server has an LLM key configured.",
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  if (!askOpen) {
    return (
      <button
        onClick={toggleAsk}
        aria-label="Ask about this scan"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-ink-500 bg-ink-850 px-4 py-2.5 text-xs text-ash-200 shadow-lg transition-colors hover:border-ash-500 hover:text-ash-100"
      >
        <MessageSquare size={14} />
        Ask about this scan
      </button>
    );
  }

  return (
    <>
      {/* Below the lg breakpoint the dock covers the page, so it needs a
          dismissable backdrop rather than sitting on top of the report. */}
      <div
        onClick={closeAsk}
        aria-hidden
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
      />

      <aside
        aria-label="Scan assistant"
        className="fixed bottom-0 right-0 top-14 z-40 flex w-full flex-col border-l border-ink-600 bg-ink-900 sm:w-[24rem]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-ash-500" />
            <p className="text-[0.7rem] uppercase tracking-[0.14em] text-ash-400">
              Ask about this scan
            </p>
          </div>
          <button
            onClick={closeAsk}
            aria-label="Close assistant"
            className="text-ash-500 transition-colors hover:text-ash-100"
          >
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          {thread.length === 0 && !pending && (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-ash-400">
                Ask anything about this scan's measurements.
              </p>
              <div className="flex flex-col items-start gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => submit(suggestion)}
                    className="rounded-full border border-ink-600 px-2.5 py-1 text-left text-[0.7rem] text-ash-400 transition-colors hover:border-ink-500 hover:text-ash-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((entry, index) => (
            <div
              key={index}
              className={cn(
                "rounded-lg px-3 py-2 text-sm leading-relaxed",
                entry.role === "user" && "ml-6 bg-ink-800 text-ash-200",
                entry.role === "assistant" && "border border-ink-600 text-ash-300",
                entry.role === "error" && "border border-ink-500 text-ash-400"
              )}
            >
              {entry.text}
            </div>
          ))}

          {pending && (
            <div className="rounded-lg border border-ink-600 px-3 py-2 text-sm text-ash-500">
              <span className="animate-pulse">Reading the measurements…</span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <footer className="shrink-0 space-y-2 border-t border-ink-600 px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              maxLength={500}
              placeholder="e.g. Is 42.8 degrees normal?"
              aria-label="Ask a question about this scan"
              className="field flex-1 text-sm"
              disabled={pending}
            />
            <button
              onClick={() => submit()}
              disabled={pending || !question.trim()}
              aria-label="Send question"
              className="rounded-lg border border-ink-600 p-2.5 text-ash-400 transition-colors hover:border-ink-500 hover:text-ash-100 disabled:opacity-40"
            >
              <CornerDownLeft size={14} />
            </button>
          </div>
          <p className="text-[0.7rem] leading-snug text-ash-500">
            Answers come only from this scan's measurements. Anything not
            measured is reported as such rather than guessed.
          </p>
        </footer>
      </aside>
    </>
  );
}
