"use client";

import { SEARCH_PROGRESS_STEPS } from "@/lib/constants";
import { useEffect, useMemo, useState } from "react";

type AIScanLoadingProps = {
  savedCount: number;
  fetchedCount: number;
  currentStep?: string;
  startedAt: number;
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}分${sec.toString().padStart(2, "0")}秒`;
}

export default function AIScanLoading({
  savedCount,
  fetchedCount,
  currentStep,
  startedAt,
}: AIScanLoadingProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const activeStepIndex = useMemo(() => {
    const idx = SEARCH_PROGRESS_STEPS.findIndex((s) => s.key === currentStep);
    if (idx >= 0) return idx;
    if (savedCount > 0) {
      return SEARCH_PROGRESS_STEPS.findIndex((s) => s.key === "saving");
    }
    if (fetchedCount > 0) {
      return SEARCH_PROGRESS_STEPS.findIndex((s) => s.key === "fetching");
    }
    return 0;
  }, [currentStep, fetchedCount, savedCount]);

  const activeLabel =
    SEARCH_PROGRESS_STEPS[activeStepIndex]?.label ??
    SEARCH_PROGRESS_STEPS[0].label;

  return (
    <section
      className="ai-scan-loading mt-6 overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 p-5 text-white shadow-lg sm:p-8"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
        <div className="ai-scan-radar mx-auto" aria-hidden="true">
          <div className="ai-scan-radar__ring ai-scan-radar__ring--outer" />
          <div className="ai-scan-radar__ring ai-scan-radar__ring--inner" />
          <div className="ai-scan-radar__sweep" />
          <div className="ai-scan-radar__pin ai-scan-radar__pin--1" />
          <div className="ai-scan-radar__pin ai-scan-radar__pin--2" />
          <div className="ai-scan-radar__pin ai-scan-radar__pin--3" />
          <div className="ai-scan-radar__core" />
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              AI Scan Mode
            </p>
            <h3 className="mt-1 break-words text-lg font-bold text-white sm:text-xl">
              {activeLabel}
            </h3>
          </div>

          <ol className="space-y-2">
            {SEARCH_PROGRESS_STEPS.map((step, index) => {
              const isDone = index < activeStepIndex;
              const isActive = index === activeStepIndex;
              return (
                <li
                  key={step.key}
                  className={`flex min-w-0 items-start gap-2 rounded-lg px-2 py-1 text-sm transition-colors ${
                    isActive
                      ? "bg-cyan-500/15 text-cyan-100"
                      : isDone
                        ? "text-cyan-200/70"
                        : "text-slate-400"
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      isActive
                        ? "animate-pulse bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.9)]"
                        : isDone
                          ? "bg-cyan-400"
                          : "bg-slate-600"
                    }`}
                  />
                  <span className="min-w-0 break-words">{step.label}</span>
                </li>
              );
            })}
          </ol>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-cyan-400/20 bg-white/5 px-4 py-3">
              <p className="text-xs text-cyan-200/80">取得済み</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {savedCount}
                <span className="ml-1 text-sm font-medium text-cyan-200">
                  件
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-white/5 px-4 py-3">
              <p className="text-xs text-cyan-200/80">経過時間</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {formatElapsed(elapsedMs)}
              </p>
            </div>
          </div>

          {fetchedCount > 0 && savedCount === 0 && (
            <p className="text-xs text-cyan-200/70">
              候補 {fetchedCount} 件を確認中…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
