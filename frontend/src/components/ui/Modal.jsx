import { useEffect } from "react";
import { X } from "lucide-react";

/** Centered overlay dialog; closes on Escape or backdrop click. */
export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel max-h-[90vh] w-full max-w-4xl overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header">
          <h3 className="panel-title">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ash-500 hover:text-ash-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
