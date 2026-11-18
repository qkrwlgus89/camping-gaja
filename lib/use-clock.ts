"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useClock(initialEpoch: number) {
  const base = useRef({ epoch: initialEpoch, perf: 0 });
  const [now, setNow] = useState(initialEpoch);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    base.current = { epoch: Date.now(), perf: performance.now() };
    let live = true;
    async function sync() {
      const before = performance.now();
      try {
        const res = await fetch("/api/time", { cache: "no-store", signal: AbortSignal.timeout(5000) });
        const { epochMs } = await res.json();
        if (!res.ok || !Number.isFinite(epochMs)) throw Error();
        if (live) { base.current = { epoch: epochMs + (performance.now() - before) / 2, perf: performance.now() }; setSynced(true); }
      } catch { if (live) setSynced(false); }
    }
    const visibility = () => { if (!document.hidden) void sync(); };
    void sync();
    const tick = setInterval(() => setNow(base.current.epoch + performance.now() - base.current.perf), 500);
    const refresh = setInterval(sync, 5 * 60000);
    document.addEventListener("visibilitychange", visibility);
    return () => { live = false; clearInterval(tick); clearInterval(refresh); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  const frameNow = useCallback(() => base.current.epoch + performance.now() - base.current.perf, []);
  return { now, synced, frameNow };
}
