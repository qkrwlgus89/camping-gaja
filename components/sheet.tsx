"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
export function Sheet({ title, eyebrow, children, onClose, wide }: { title: string; eyebrow?: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button,input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key !== "Tab") return;
      const all = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href],[tabindex="0"]') ?? [])];
      const first = all[0], last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); before?.focus(); };
  }, [onClose]);
  return <div className="sheet-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={`sheet ${wide ? "sheet-wide" : ""}`}>
      <div className="sheet-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={id}>{title}</h2></div><button className="icon-btn" onClick={onClose} aria-label="닫기"><X size={21} /></button></div>
      {children}
    </div>
  </div>;
}
