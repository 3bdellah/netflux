import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, RefreshCw, Square, TimerReset } from "lucide-react";
import SEO from "../components/SEO";
import { isAbortError, runCloudflareSpeedTest, type AccuracyLevel } from "../lib/cloudflareSpeedTest";
import { loadNetworkInfo } from "../lib/networkInfo";

type TestPhase = "IDLE" | "PING" | "DOWNLOAD" | "UPLOAD" | "COMPLETED" | "STOPPED" | "ERROR";

interface SpeedStats {
  ping: number | null;
  download: number;
  upload: number;
}

interface ServerInfo {
  ip: string;
  city: string;
  country?: string;
  code: string;
}

interface HistoryEntry extends SpeedStats {
  createdAt: string;
  serverCity: string;
  serverCode: string;
}

interface FinalResult extends SpeedStats {
  jitter: number;
  accuracy: AccuracyLevel;
  completedAt: string;
}

const HISTORY_KEY = "netflux-speed-history";
const FINAL_RESULT_KEY = "netflux-final-result";
const HISTORY_LIMIT = 5;
const SPEED_PRECISION = 2;
const LATENCY_PRECISION = 1;
const SPEED_SCALE_MAX_MBPS = 1000;
const SPEED_SCALE_LABELS = [
  { label: "0Mb", value: 0 },
  { label: "100Mb", value: 100 },
  { label: "250Mb", value: 250 },
  { label: "500Mb", value: 500 },
  { label: "750Mb", value: 750 },
  { label: "1Gb", value: 1000 },
];

function formatSpeed(value: number | null, active = false) {
  if (value === null || !Number.isFinite(value) || (!active && value <= 0)) return "--";
  return value.toFixed(SPEED_PRECISION);
}

function formatLatency(value: number | null, active = false) {
  if (value === null || !Number.isFinite(value) || (!active && value <= 0)) return "--";
  return value.toFixed(LATENCY_PRECISION);
}

function normalizeMetric(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isValidDateString(value: unknown) {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function sanitizeHistoryEntries(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): HistoryEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Partial<HistoryEntry>;

      if (
        !isValidDateString(candidate.createdAt) ||
        typeof candidate.serverCity !== "string" ||
        typeof candidate.serverCode !== "string"
      ) {
        return null;
      }

      return {
        createdAt: candidate.createdAt,
        serverCity: candidate.serverCity,
        serverCode: candidate.serverCode,
        ping: normalizeMetric(Number(candidate.ping)),
        download: normalizeMetric(Number(candidate.download)),
        upload: normalizeMetric(Number(candidate.upload)),
      };
    })
    .filter((entry): entry is HistoryEntry => entry !== null);
}

function sanitizeFinalResult(value: unknown): FinalResult | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<FinalResult>;
  const completedAt = candidate.completedAt;

  if (!isValidDateString(completedAt)) {
    return null;
  }

  return {
    completedAt,
    ping: normalizeMetric(Number(candidate.ping)),
    download: normalizeMetric(Number(candidate.download)),
    upload: normalizeMetric(Number(candidate.upload)),
    jitter: normalizeMetric(Number(candidate.jitter)),
    accuracy: candidate.accuracy === "high" || candidate.accuracy === "medium" ? candidate.accuracy : "low",
  };
}

function formatDateSafe(formatter: Intl.DateTimeFormat, value: string) {
  if (!isValidDateString(value)) return "--";

  try {
    return formatter.format(new Date(value));
  } catch {
    return "--";
  }
}

function readSavedHistory() {
  try {
    const savedHistory = window.localStorage.getItem(HISTORY_KEY);
    return savedHistory ? sanitizeHistoryEntries(JSON.parse(savedHistory)) : [];
  } catch {
    removeSavedHistory();
    return [];
  }
}

function persistHistory(history: HistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  } catch {
    // The final result should still render even when storage is blocked.
  }
}

function mergeHistoryEntry(previous: HistoryEntry[], entry: HistoryEntry) {
  return [
    entry,
    ...previous.filter((item) => item.createdAt !== entry.createdAt),
  ].slice(0, HISTORY_LIMIT);
}

function readFinalResult() {
  try {
    const savedResult = window.sessionStorage.getItem(FINAL_RESULT_KEY);
    return savedResult ? sanitizeFinalResult(JSON.parse(savedResult)) : null;
  } catch {
    removeFinalResult();
    return null;
  }
}

function persistFinalResult(result: FinalResult) {
  try {
    window.sessionStorage.setItem(FINAL_RESULT_KEY, JSON.stringify(result));
  } catch {
    // The visible result is already in React state.
  }
}

function removeFinalResult() {
  try {
    window.sessionStorage.removeItem(FINAL_RESULT_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function removeSavedHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function getStageState(
  phase: TestPhase,
  progressValue: number,
  threshold: number,
  stagePhase: "PING" | "DOWNLOAD" | "UPLOAD",
) {
  const isActive = phase === stagePhase || (phase === "COMPLETED" && stagePhase === "UPLOAD");
  const isDone = progressValue >= threshold || (phase === "COMPLETED" && stagePhase !== "UPLOAD");
  return { isActive, isDone };
}

export default function SpeedTest() {
  const [phase, setPhase] = useState<TestPhase>("IDLE");
  const [stats, setStats] = useState<SpeedStats>({
    ping: null,
    download: 0,
    upload: 0,
  });
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Ready");
  const [serverInfo, setServerInfo] = useState<ServerInfo>({
    ip: "--",
    city: "Locating...",
    code: "NETFLUX",
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const latestHistoryKey = history[0]?.createdAt ?? null;
  const historyDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    [],
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const isRunning = phase === "PING" || phase === "DOWNLOAD" || phase === "UPLOAD";
  const canStart = !isRunning;
  const showCenterStartButton = phase === "IDLE" || phase === "STOPPED" || phase === "ERROR";

  const assertActive = (signal: AbortSignal, runId: number) => {
    if (signal.aborted || runIdRef.current !== runId) {
      throw new DOMException("Aborted", "AbortError");
    }
  };

  useEffect(() => {
    const savedHistory = readSavedHistory();
    const savedFinalResult = readFinalResult();

    if (savedHistory.length) {
      setHistory(savedHistory.slice(0, HISTORY_LIMIT));
    }

    if (savedFinalResult) {
      setFinalResult(savedFinalResult);
      setStats({
        ping: savedFinalResult.ping,
        download: savedFinalResult.download,
        upload: savedFinalResult.upload,
      });
      setProgress(1);
      setPhase("COMPLETED");
      setStatusText("Completed");
    }
  }, []);

  useEffect(() => {
    persistHistory(history);
  }, [history]);

  useEffect(() => {
    let cancelled = false;

    const loadServerInfo = async () => {
      try {
        const data = await loadNetworkInfo();
        if (cancelled) return;

        setServerInfo({
          ip: data.ip || "--",
          city: data.city || "Unknown",
          country: data.country,
          code: data.code || "NETFLUX",
        });
      } catch {
        if (!cancelled) {
          setServerInfo({
            ip: "--",
            city: "Unavailable",
            code: "NETFLUX",
          });
        }
      }
    };

    loadServerInfo();
    return () => {
      cancelled = true;
      abortControllerRef.current?.abort();
    };
  }, []);

  const startTest = async () => {
    if (!canStart) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPhase("PING");
    setStats({ ping: null, download: 0, upload: 0 });
    setFinalResult(null);
    removeFinalResult();
    setLiveSpeed(0);
    setProgress(0);
    setStatusText("Checking latency");

    try {
      const result = await runCloudflareSpeedTest({
        signal: controller.signal,
        onPhaseChange: (nextPhase) => {
          assertActive(controller.signal, runId);

          if (nextPhase === "latency") {
            setPhase("PING");
            setProgress(0);
            setStatusText("Checking latency");
            return;
          }

          if (nextPhase === "download") {
            setPhase("DOWNLOAD");
            setProgress(0);
            setLiveSpeed(0);
            setStatusText("Testing download");
            return;
          }

          setPhase("UPLOAD");
          setProgress(0);
          setLiveSpeed(0);
          setStatusText("Testing upload");
        },
        onLatencyProgress: (update) => {
          assertActive(controller.signal, runId);
          setStats((previous) => ({ ...previous, ping: normalizeMetric(update.latency) }));
          setProgress(update.progress);
        },
        onDownloadProgress: (update) => {
          assertActive(controller.signal, runId);
          setLiveSpeed(normalizeMetric(update.currentMbps) || normalizeMetric(update.averageMbps));
          setStats((previous) => ({ ...previous, download: normalizeMetric(update.averageMbps) }));
          setProgress(update.progress);
        },
        onUploadProgress: (update) => {
          assertActive(controller.signal, runId);
          setLiveSpeed(normalizeMetric(update.currentMbps) || normalizeMetric(update.averageMbps));
          setStats((previous) => ({ ...previous, upload: normalizeMetric(update.averageMbps) }));
          setProgress(update.progress);
        },
      });
      assertActive(controller.signal, runId);

      const completedResult: SpeedStats = {
        ping: normalizeMetric(result.latency),
        download: normalizeMetric(result.download),
        upload: normalizeMetric(result.upload),
      };
      const completedAt = new Date().toISOString();
      const finalResultSnapshot: FinalResult = {
        ...completedResult,
        jitter: normalizeMetric(result.jitter),
        accuracy: result.accuracy,
        completedAt,
      };

      setStats(completedResult);
      setFinalResult(finalResultSnapshot);
      persistFinalResult(finalResultSnapshot);
      setLiveSpeed(0);
      setProgress(1);
      setPhase("COMPLETED");
      setStatusText("Completed");
      saveCompletedResult({
        ...completedResult,
        createdAt: completedAt,
        serverCity: serverInfo.city,
        serverCode: serverInfo.code,
      });
    } catch (error) {
      if (isAbortError(error)) {
        setPhase("STOPPED");
        setLiveSpeed(0);
        setProgress(0);
        setStatusText("Stopped");
      } else {
        console.error("Speed test failed", error);
        setPhase("ERROR");
        setLiveSpeed(0);
        setProgress(0);
        setStatusText("Error");
      }
    } finally {
      if (runId === runIdRef.current) {
        abortControllerRef.current = null;
      }
    }
  };

  const stopTest = () => {
    abortControllerRef.current?.abort();
  };

  const saveCompletedResult = (entry: HistoryEntry) => {
    setHistory((previous) => {
      const nextHistory = mergeHistoryEntry(previous, entry);
      persistHistory(nextHistory);
      return nextHistory;
    });
  };

  const displayedDownload = phase === "DOWNLOAD" ? normalizeMetric(liveSpeed) || stats.download : stats.download;
  const displayedUpload = phase === "UPLOAD" ? normalizeMetric(liveSpeed) || stats.upload : stats.upload;

  const dialMbpsValue = useMemo(() => {
    if (phase === "DOWNLOAD" || phase === "UPLOAD") {
      return phase === "UPLOAD" ? displayedUpload : displayedDownload;
    }

    if (phase === "COMPLETED") {
      return stats.upload;
    }

    return 0;
  }, [displayedDownload, displayedUpload, phase, stats.upload]);

  const heroValue = useMemo(() => {
    if (phase === "PING") {
      return stats.ping ? stats.ping.toFixed(1) : "0.0";
    }

    if (phase === "DOWNLOAD") {
      return displayedDownload > 0 ? displayedDownload.toFixed(2) : "0.00";
    }

    if (phase === "UPLOAD") {
      return displayedUpload > 0 ? displayedUpload.toFixed(2) : "0.00";
    }

    if (phase === "COMPLETED") {
      return stats.upload > 0 ? stats.upload.toFixed(2) : "0.00";
    }

    return "0.00";
  }, [displayedDownload, displayedUpload, phase, stats.ping, stats.upload]);

  const heroUnit = phase === "PING" ? "ms" : "Mbps";
  const heroLabel =
    phase === "PING"
      ? "Ping"
      : phase === "UPLOAD"
        ? "Upload"
        : phase === "COMPLETED"
          ? "Upload"
          : "Download";
  const overallProgress = useMemo(() => {
    if (phase === "PING") return progress * 0.18;
    if (phase === "DOWNLOAD") return 0.18 + progress * 0.5;
    if (phase === "UPLOAD") return 0.68 + progress * 0.32;
    if (phase === "COMPLETED") return 1;
    return 0;
  }, [phase, progress]);
  const progressValue = isRunning || phase === "COMPLETED" ? Math.min(overallProgress, 1) : 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8">
      <SEO
        title="NetFlux Speed Test | Measure Ping, Download and Upload"
        description="Run a clean, modern internet speed test with ping, download and upload measurements."
      />

      <section className="flex flex-col gap-5 px-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">NetFlux Speed Test</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <MetaPill
              label="Location"
              value={`${[serverInfo.city, serverInfo.country || serverInfo.code].filter(Boolean).join(" / ")} | ${serverInfo.ip}`}
            />
            <MetaPill label="Status" value={statusText} />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.03] p-5 shadow-[0_20px_60px_rgba(2,6,23,0.24)] sm:p-6">
            <div className="flex flex-col items-center gap-6 text-center">
              <PhaseTabs phase={phase} />

              <div className="simple-dial">
                <DialRing progress={progress} phase={phase} speedValue={dialMbpsValue} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {showCenterStartButton ? (
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={startTest}
                      className="flex h-28 w-28 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 text-lg font-medium uppercase tracking-[0.35em] text-white shadow-[0_18px_50px_rgba(56,189,248,0.14)] transition-colors hover:bg-sky-400/16"
                    >
                      GO
                    </motion.button>
                  ) : (
                    <>
                      <div className="rounded-full border border-white/8 bg-slate-950/45 px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-slate-300 shadow-[0_8px_24px_rgba(2,6,23,0.22)]">
                        {heroLabel}
                      </div>
                      <motion.div
                        key={`${phase}-${heroValue}`}
                        initial={{ opacity: 0.75, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-4 flex items-end gap-2"
                      >
                        <span className="text-4xl font-medium tracking-[-0.06em] text-white sm:text-5xl">
                          {heroValue}
                        </span>
                        <span className="pb-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">{heroUnit}</span>
                      </motion.div>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full max-w-xl">
                <SpeedtestProgress phase={phase} progressValue={progressValue} />
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                {!canStart && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={stopTest}
                    className="control-button control-button-danger"
                  >
                    <Square size={14} />
                    Stop
                  </motion.button>
                )}
                {phase === "COMPLETED" && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={startTest}
                    className="control-button px-4 py-3 text-[11px]"
                  >
                    <RefreshCw size={14} />
                    Retest
                  </motion.button>
                )}
              </div>

              {finalResult && (
                <FinalResultPanel result={finalResult} dateFormatter={historyDateFormatter} />
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <MetricCard
              icon={<TimerReset size={18} />}
              label="Ping"
              value={formatLatency(stats.ping, phase === "PING")}
              unit="ms"
              active={phase === "PING"}
            />
            <MetricCard
              icon={<ArrowDown size={18} />}
              label="Download"
              value={formatSpeed(displayedDownload, phase === "DOWNLOAD")}
              unit="Mbps"
              active={phase === "DOWNLOAD"}
            />
            <MetricCard
              icon={<ArrowUp size={18} />}
              label="Upload"
              value={formatSpeed(displayedUpload, phase === "UPLOAD")}
              unit="Mbps"
              active={phase === "UPLOAD"}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5 px-1">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Recent Tests</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-medium tracking-[-0.04em] text-white">History</h2>
              {phase === "COMPLETED" && latestHistoryKey === finalResult?.completedAt && (
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                  Updated
                </span>
              )}
            </div>
          </div>
          {history.length > 0 && (
            <button
              onClick={() => {
                setHistory([]);
                removeSavedHistory();
              }}
              className="control-button px-4 py-3 text-[11px]"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3">
          {history.length === 0 ? (
            <div className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-6 text-sm text-slate-400">
              No saved results yet.
            </div>
          ) : (
            history.map((entry, index) => (
              <div
                key={`${entry.createdAt}-${index}`}
                className={`grid gap-3 rounded-[1.4rem] border px-4 py-4 md:grid-cols-[1.25fr_repeat(3,minmax(0,1fr))] ${
                  index === 0 && entry.createdAt === finalResult?.completedAt
                    ? "border-emerald-300/20 bg-emerald-400/8"
                    : "border-white/8 bg-white/[0.03]"
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-white">{entry.serverCity}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {entry.serverCode} / {formatDateSafe(historyDateFormatter, entry.createdAt)}
                  </span>
                </div>
                <ResultCell label="Ping" value={formatLatency(entry.ping)} unit="ms" />
                <ResultCell label="Download" value={formatSpeed(entry.download)} unit="Mbps" />
                <ResultCell label="Upload" value={formatSpeed(entry.upload)} unit="Mbps" />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function FinalResultPanel({
  result,
  dateFormatter,
}: {
  result: FinalResult;
  dateFormatter: Intl.DateTimeFormat;
}) {
  return (
    <div className="w-full max-w-xl rounded-[1.2rem] border border-emerald-300/20 bg-emerald-400/8 px-4 py-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.26em] text-emerald-200">Final Test Result</span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/70">
          {formatDateSafe(dateFormatter, result.completedAt)}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FinalResultStat label="Ping" value={formatLatency(result.ping, true)} unit="ms" />
        <FinalResultStat label="Download" value={formatSpeed(result.download, true)} unit="Mbps" />
        <FinalResultStat label="Upload" value={formatSpeed(result.upload, true)} unit="Mbps" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.2em] text-slate-300">
        <span>Jitter: {formatLatency(result.jitter, true)} ms</span>
        <span>Accuracy: {result.accuracy}</span>
      </div>
    </div>
  );
}

function FinalResultStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg font-medium text-white">{value}</span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">
      <span className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</span>
      <span className="ml-2 text-sm text-slate-200">{value}</span>
    </div>
  );
}

function PhaseTabs({ phase }: { phase: TestPhase }) {
  const items = [
    { label: "Ping", value: "PING" },
    { label: "Download", value: "DOWNLOAD" },
    { label: "Upload", value: "UPLOAD" },
  ] as const;

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((item) => {
        const active = phase === item.value || (phase === "COMPLETED" && item.value === "UPLOAD");
        return (
          <div
            key={item.value}
            className={`rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.28em] ${
              active
                ? "border-sky-300/30 bg-sky-400/10 text-sky-200"
                : "border-white/8 bg-white/[0.03] text-slate-400"
            }`}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-[1.4rem] border p-4 transition-all duration-300 ${
        active
          ? "border-sky-300/20 bg-sky-400/10 shadow-[0_18px_50px_rgba(56,189,248,0.08)]"
          : "border-white/8 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
        <div className="rounded-full border border-white/8 bg-slate-950/45 p-2 text-slate-200">{icon}</div>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-medium tracking-[-0.05em] text-white">{value}</span>
        <span className="pb-1 text-xs uppercase tracking-[0.24em] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function ResultCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-medium text-white">{value}</span>
        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function SpeedtestProgress({
  phase,
  progressValue,
}: {
  phase: TestPhase;
  progressValue: number;
}) {
  const stages = [
    { label: "Ping", threshold: 0.18, phase: "PING" as const },
    { label: "Download", threshold: 0.68, phase: "DOWNLOAD" as const },
    { label: "Upload", threshold: 1, phase: "UPLOAD" as const },
  ];

  return (
    <div className="w-full">
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
        <motion.div
          className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-500 via-sky-300 to-cyan-200 shadow-[0_0_18px_rgba(56,189,248,0.55)]"
          initial={false}
          animate={{
            width: `${progressValue * 100}%`,
            opacity: progressValue > 0 ? 1 : 0,
          }}
          transition={{ type: "spring", stiffness: 72, damping: 22, mass: 1.05 }}
        />
        <motion.div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-sky-300 shadow-[0_0_22px_rgba(125,211,252,0.85)]"
          initial={false}
          animate={{
            left: `${progressValue * 100}%`,
            opacity: progressValue > 0 ? 1 : 0,
            scale: progressValue > 0 ? 1 : 0.7,
          }}
          transition={{ type: "spring", stiffness: 90, damping: 18, mass: 0.8 }}
        />

        {stages.map((stage, index) => {
          const left = `${(index / (stages.length - 1)) * 100}%`;
          const { isActive, isDone } = getStageState(phase, progressValue, stage.threshold, stage.phase);

          return (
            <div
              key={stage.label}
              className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center"
              style={{ left, transform: "translate(-50%, -50%)" }}
            >
              <div
                className={`h-2.5 w-2.5 rounded-full border transition-all duration-300 ${
                  isDone
                    ? "border-sky-200 bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.75)]"
                    : isActive
                      ? "border-sky-200/70 bg-sky-300/70"
                      : "border-white/20 bg-slate-900"
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-500">
        {stages.map((stage) => {
          const { isActive, isDone } = getStageState(phase, progressValue, stage.threshold, stage.phase);

          return (
            <span
              key={stage.label}
              className={isDone || isActive ? "text-slate-300" : undefined}
            >
              {stage.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DialRing({
  progress,
  phase,
  speedValue,
}: {
  progress: number;
  phase: TestPhase;
  speedValue: number;
}) {
  const size = 360;
  const stroke = 14;
  const radius = 128;
  const center = size / 2;
  const startAngle = 145;
  const endAngle = 395;
  const arcSpan = endAngle - startAngle;
  const speedRatio = Math.max(0, Math.min(speedValue / SPEED_SCALE_MAX_MBPS, 1));
  const showSpeedState = phase === "DOWNLOAD" || phase === "UPLOAD" || phase === "COMPLETED";
  const isDialActive = phase !== "IDLE" && phase !== "STOPPED" && phase !== "ERROR";
  const progressRatio = Math.max(progress, isDialActive ? 0.04 : 0);
  const activeRatio = showSpeedState ? speedRatio : progressRatio;
  const activeEndAngle = startAngle + activeRatio * arcSpan;
  const outerRadius = radius + 18;
  const innerRadius = radius - 26;
  const activePoint = polarToCartesian(center, center, radius, activeEndAngle);
  const needleTipPoint = polarToCartesian(center, center, radius - 20, activeEndAngle);
  const needleTailPoint = polarToCartesian(center, center, 32, activeEndAngle + 180);
  const tickCount = 28;
  const isUploadPhase = phase === "UPLOAD";
  const accentColor = isUploadPhase ? "#fbbf24" : "#7dd3fc";
  const accentGlow = isUploadPhase ? "rgba(251,191,36,0.22)" : "rgba(125,211,252,0.22)";

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full overflow-visible">
      <defs>
        <linearGradient id="speedtest-dial-active" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={isUploadPhase ? "#fb923c" : "#38bdf8"} />
          <stop offset="55%" stopColor={isUploadPhase ? "#fbbf24" : "#7dd3fc"} />
          <stop offset="100%" stopColor={isUploadPhase ? "#fde68a" : "#cffafe"} />
        </linearGradient>
        <linearGradient id="speedtest-dial-needle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(248,250,252,0.95)" />
          <stop offset="40%" stopColor={isUploadPhase ? "#fcd34d" : "#93c5fd"} />
          <stop offset="100%" stopColor={isUploadPhase ? "#f59e0b" : "#38bdf8"} />
        </linearGradient>
        <radialGradient id="speedtest-dial-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
        </radialGradient>
      </defs>

      <circle cx={center} cy={center} r={outerRadius + 24} fill="url(#speedtest-dial-core)" opacity="0.55" />
      <circle cx={center} cy={center} r={outerRadius + 6} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
      <circle cx={center} cy={center} r={innerRadius - 10} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

      {Array.from({ length: tickCount + 1 }).map((_, index) => {
        const angle = startAngle + (arcSpan / tickCount) * index;
        const start = polarToCartesian(center, center, radius + 10, angle);
        const end = polarToCartesian(center, center, radius + (index % 4 === 0 ? 24 : 18), angle);
        const tickRatio = index / tickCount;
        const isReached = isDialActive && tickRatio <= activeRatio;

        return (
          <line
            key={`tick-${angle}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={isReached ? "rgba(226,232,240,0.92)" : "rgba(255,255,255,0.15)"}
            strokeWidth={index % 4 === 0 ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}

      <path
        d={describeArc(center, center, radius, startAngle, endAngle)}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={describeArc(center, center, radius - 18, startAngle, endAngle)}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <motion.path
        d={describeArc(center, center, radius, startAngle, activeEndAngle)}
        fill="none"
        stroke="url(#speedtest-dial-active)"
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={false}
        animate={{ d: describeArc(center, center, radius, startAngle, activeEndAngle) }}
        transition={{ type: "spring", stiffness: 110, damping: 18 }}
      />
      <motion.path
        d={describeArc(center, center, radius - 18, startAngle, activeEndAngle)}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="4"
        strokeLinecap="round"
        initial={false}
        animate={{ d: describeArc(center, center, radius - 18, startAngle, activeEndAngle) }}
        transition={{ type: "spring", stiffness: 110, damping: 18 }}
      />
      {isDialActive && (
        <motion.path
          d={describeArc(center, center, radius - 8, startAngle, activeEndAngle)}
          fill="none"
          stroke={accentGlow}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 9"
          initial={false}
          animate={{ strokeDashoffset: [-14, -48] }}
          transition={{ duration: 1.8, ease: "linear", repeat: Infinity }}
        />
      )}

      <motion.line
        x1={needleTailPoint.x}
        y1={needleTailPoint.y}
        x2={needleTipPoint.x}
        y2={needleTipPoint.y}
        stroke="url(#speedtest-dial-needle)"
        strokeWidth="4"
        strokeLinecap="round"
        initial={false}
        animate={{
          x1: needleTailPoint.x,
          y1: needleTailPoint.y,
          x2: needleTipPoint.x,
          y2: needleTipPoint.y,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      <motion.circle
        cx={center}
        cy={center}
        r="14"
        fill={accentGlow}
        initial={false}
        animate={{
          opacity: isDialActive ? [0.4, 0.75, 0.4] : 0.32,
        }}
        transition={{ duration: 1.4, ease: "easeInOut", repeat: isDialActive ? Infinity : 0 }}
      />
      <circle cx={center} cy={center} r="8" fill={accentColor} />
      <circle cx={center} cy={center} r="4" fill="#f8fafc" />

      {showSpeedState && (
        <>
          <motion.circle
            cx={activePoint.x}
            cy={activePoint.y}
            r="8"
            fill={accentColor}
            initial={false}
            animate={{ cx: activePoint.x, cy: activePoint.y }}
            transition={{ type: "spring", stiffness: 110, damping: 18 }}
          />
          <motion.circle
            cx={activePoint.x}
            cy={activePoint.y}
            r="18"
            fill={accentGlow}
            initial={false}
            animate={{ cx: activePoint.x, cy: activePoint.y }}
            transition={{ type: "spring", stiffness: 110, damping: 18 }}
          />
        </>
      )}

      {SPEED_SCALE_LABELS.map((item) => {
        const ratio = item.value / SPEED_SCALE_MAX_MBPS;
        const angle = startAngle + ratio * arcSpan;
        const point = polarToCartesian(center, center, radius + 42, angle);
        const isReached = speedValue >= item.value && showSpeedState;

        return (
          <text
            key={item.label}
            x={point.x}
            y={point.y}
            fill={isReached ? "rgba(226,232,240,0.96)" : "rgba(148,163,184,0.72)"}
            fontSize="11"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {item.label}
          </text>
        );
      })}
    </svg>
  );
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const safeEndAngle = Math.abs(endAngle - startAngle) < 0.01 ? startAngle + 0.01 : endAngle;
  const start = polarToCartesian(x, y, radius, startAngle);
  const end = polarToCartesian(x, y, radius, safeEndAngle);
  const largeArcFlag = safeEndAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    1,
    end.x,
    end.y,
  ].join(" ");
}
