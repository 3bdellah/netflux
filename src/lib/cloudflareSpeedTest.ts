export type AccuracyLevel = "high" | "medium" | "low";

export interface CloudflareSpeedTestResult {
  download: number;
  upload: number;
  latency: number;
  jitter: number;
  accuracy: AccuracyLevel;
}

export interface LatencyProgressUpdate {
  progress: number;
  latency: number;
  jitter: number;
  sampleCount: number;
}

export interface ThroughputProgressUpdate {
  progress: number;
  currentMbps: number;
  averageMbps: number;
  transferredBytes: number;
}

export interface LatencyTestResult {
  latency: number;
  jitter: number;
  samples: number[];
  successfulRequests: number;
  retries: number;
  failures: number;
}

export interface ThroughputTestResult {
  mbps: number;
  samples: number[];
  successfulRequests: number;
  retries: number;
  failures: number;
}

export interface CloudflareSpeedTestOptions {
  signal: AbortSignal;
  onPhaseChange?: (phase: "latency" | "download" | "upload") => void;
  onLatencyProgress?: (update: LatencyProgressUpdate) => void;
  onDownloadProgress?: (update: ThroughputProgressUpdate) => void;
  onUploadProgress?: (update: ThroughputProgressUpdate) => void;
  maxRetries?: number;
}

interface RetrySuccess<T> {
  ok: true;
  value: T;
  attempts: number;
}

interface RetryFailure {
  ok: false;
  error: unknown;
  attempts: number;
}

type RetryResult<T> = RetrySuccess<T> | RetryFailure;

interface RequestMeasurement {
  bytes: number;
  durationMs: number;
  mbps: number;
  startedAt: number;
  endedAt: number;
}

const CLOUDFLARE_DOWNLOAD_URL = "https://speed.cloudflare.com/__down";
const CLOUDFLARE_UPLOAD_URL = "https://speed.cloudflare.com/__up";
const BYTES_IN_MEGABYTE = 1024 * 1024;
const DEFAULT_MAX_RETRIES = 2;
const PHASE_MAX_DURATION_MS = 10_000;
const LATENCY_SAMPLE_COUNT = 10;
const LATENCY_WARMUP_COUNT = 2;
const LATENCY_REQUEST_BYTES = 1;
const DOWNLOAD_MAX_DURATION_MS = 5_000;
const DOWNLOAD_WARMUP_BYTES = 256 * 1024;
const DOWNLOAD_STAGE_BYTES = [1, 5, 10].map((value) => value * BYTES_IN_MEGABYTE);
const DOWNLOAD_STAGE_PARALLELISM = [3, 4, 6];
const UPLOAD_WARMUP_BYTES = 256 * 1024;
const UPLOAD_STAGE_BYTES = [512 * 1024, 1 * BYTES_IN_MEGABYTE, 2 * BYTES_IN_MEGABYTE, 3 * BYTES_IN_MEGABYTE];

export async function runCloudflareSpeedTest(
  options: CloudflareSpeedTestOptions,
): Promise<CloudflareSpeedTestResult> {
  const { signal, onPhaseChange, onLatencyProgress, onDownloadProgress, onUploadProgress } = options;

  assertNotAborted(signal);
  onPhaseChange?.("latency");
  const latencyResult = await testLatency({
    signal,
    maxRetries: options.maxRetries,
    onProgress: onLatencyProgress,
  });

  assertNotAborted(signal);
  onPhaseChange?.("download");
  const downloadResult = await testDownload({
    signal,
    maxRetries: options.maxRetries,
    onProgress: onDownloadProgress,
  });

  assertNotAborted(signal);
  onPhaseChange?.("upload");
  const uploadResult = await testUpload({
    signal,
    maxRetries: options.maxRetries,
    onProgress: onUploadProgress,
  });

  return {
    download: downloadResult.mbps,
    upload: uploadResult.mbps,
    latency: latencyResult.latency,
    jitter: latencyResult.jitter,
    accuracy: deriveAccuracy(latencyResult, downloadResult, uploadResult),
  };
}

export async function testLatency({
  signal,
  maxRetries = DEFAULT_MAX_RETRIES,
  onProgress,
}: {
  signal: AbortSignal;
  maxRetries?: number;
  onProgress?: (update: LatencyProgressUpdate) => void;
}): Promise<LatencyTestResult> {
  assertNotAborted(signal);

  const latencyStartedAt = performance.now();
  const getRemainingLatencyMs = () => PHASE_MAX_DURATION_MS - (performance.now() - latencyStartedAt);

  for (let index = 0; index < LATENCY_WARMUP_COUNT; index += 1) {
    if (getRemainingLatencyMs() <= 0) {
      break;
    }

    await retryRequest(
      async (attemptSignal) => {
        await measureLatencyRequest(attemptSignal);
      },
      {
        signal,
        timeoutMs: () => Math.min(4_000, getRemainingLatencyMs()),
        maxRetries: getRemainingLatencyMs() > 2_500 ? maxRetries : 0,
      },
    );
  }

  const samples: number[] = [];
  let retries = 0;
  let failures = 0;

  for (let index = 0; index < LATENCY_SAMPLE_COUNT; index += 1) {
    assertNotAborted(signal);

    const remainingMs = getRemainingLatencyMs();

    if (remainingMs <= 0) {
      break;
    }

    const result = await retryRequest(
      (attemptSignal) => measureLatencyRequest(attemptSignal),
      {
        signal,
        timeoutMs: () => Math.min(4_000, getRemainingLatencyMs()),
        maxRetries: remainingMs > 2_500 ? maxRetries : 0,
      },
    );

    retries += result.attempts - 1;

    if (result.ok) {
      samples.push(result.value);
    } else {
      failures += 1;
    }

    const stableSamples = filterOutlierValues(samples);
    onProgress?.({
      progress: Math.min((index + 1) / LATENCY_SAMPLE_COUNT, 1),
      latency: average(stableSamples),
      jitter: calculateJitter(stableSamples),
      sampleCount: samples.length,
    });

    if (index < LATENCY_SAMPLE_COUNT - 1 && getRemainingLatencyMs() > 120) {
      await sleep(Math.min(120, getRemainingLatencyMs()), signal);
    }
  }

  if (!samples.length) {
    throw new Error("Unable to collect latency samples.");
  }

  const stableSamples = filterOutlierValues(samples);

  return {
    latency: average(stableSamples),
    jitter: calculateJitter(stableSamples),
    samples,
    successfulRequests: samples.length,
    retries,
    failures,
  };
}

export async function testDownload({
  signal,
  maxRetries = DEFAULT_MAX_RETRIES,
  onProgress,
}: {
  signal: AbortSignal;
  maxRetries?: number;
  onProgress?: (update: ThroughputProgressUpdate) => void;
}): Promise<ThroughputTestResult> {
  assertNotAborted(signal);

  const downloadStartedAt = performance.now();
  const getRemainingDownloadMs = () => DOWNLOAD_MAX_DURATION_MS - (performance.now() - downloadStartedAt);

  const warmupResults = await Promise.all(
    Array.from({ length: 2 }, () =>
      retryRequest(
        (attemptSignal) => downloadRequest(DOWNLOAD_WARMUP_BYTES, attemptSignal),
        {
          signal,
          timeoutMs: () => Math.min(getDownloadTimeoutMs(DOWNLOAD_WARMUP_BYTES), getRemainingDownloadMs()),
          maxRetries,
        },
      ),
    ),
  );

  const warmupSucceeded = warmupResults.some((result) => result.ok);
  if (!warmupSucceeded) {
    throw new Error("Unable to warm up the Cloudflare download test.");
  }

  const tracker = createThroughputTracker();
  const totalPlannedBytes = DOWNLOAD_STAGE_BYTES.reduce(
    (total, bytes, index) => total + bytes * DOWNLOAD_STAGE_PARALLELISM[index],
    0,
  );

  const stageResults: Array<{ bytes: number; mbps: number }> = [];
  const requestSamples: number[] = [];
  let retries = 0;
  let failures = 0;

  for (let stageIndex = 0; stageIndex < DOWNLOAD_STAGE_BYTES.length; stageIndex += 1) {
    assertNotAborted(signal);
    const remainingMs = getRemainingDownloadMs();

    if (remainingMs <= 0) {
      break;
    }

    const bytes = DOWNLOAD_STAGE_BYTES[stageIndex];
    const parallelism = DOWNLOAD_STAGE_PARALLELISM[stageIndex];
    const results = await Promise.all(
      Array.from({ length: parallelism }, () =>
        retryRequest(
          (attemptSignal) =>
            downloadRequest(bytes, attemptSignal, (chunkBytes) => {
              const snapshot = tracker.record(chunkBytes);
              onProgress?.({
                progress: Math.min(snapshot.transferredBytes / totalPlannedBytes, 1),
                currentMbps: snapshot.currentMbps,
                averageMbps: snapshot.averageMbps,
                transferredBytes: snapshot.transferredBytes,
              });
            }),
          {
            signal,
            timeoutMs: () => Math.min(getDownloadTimeoutMs(bytes), getRemainingDownloadMs()),
            maxRetries,
          },
        ),
      ),
    );

    const successfulMeasurements: RequestMeasurement[] = [];

    for (const result of results) {
      retries += result.attempts - 1;

      if (result.ok) {
        successfulMeasurements.push(result.value);
        requestSamples.push(result.value.mbps);
      } else {
        failures += 1;
      }
    }

    if (!successfulMeasurements.length) {
      continue;
    }

    const stableMeasurements = filterOutlierMeasurements(successfulMeasurements);
    const stageStartedAt = Math.min(...stableMeasurements.map((measurement) => measurement.startedAt));
    const stageEndedAt = Math.max(...stableMeasurements.map((measurement) => measurement.endedAt));
    const stageDurationSeconds = Math.max((stageEndedAt - stageStartedAt) / 1000, 0.001);
    const stageBytes = stableMeasurements.reduce((total, measurement) => total + measurement.bytes, 0);

    stageResults.push({
      bytes: stageBytes,
      mbps: calculateMbps(stageBytes, stageDurationSeconds),
    });
  }

  if (!stageResults.length) {
    throw new Error("Unable to complete Cloudflare download test.");
  }

  const finalSpeed = weightedAverage(
    stageResults.map((stage) => ({ value: stage.mbps, weight: stage.bytes })),
  );

  onProgress?.({
    progress: 1,
    currentMbps: finalSpeed,
    averageMbps: finalSpeed,
    transferredBytes: tracker.transferredBytes,
  });

  return {
    mbps: finalSpeed,
    samples: requestSamples,
    successfulRequests: requestSamples.length,
    retries,
    failures,
  };
}

export async function testUpload({
  signal,
  maxRetries = DEFAULT_MAX_RETRIES,
  onProgress,
}: {
  signal: AbortSignal;
  maxRetries?: number;
  onProgress?: (update: ThroughputProgressUpdate) => void;
}): Promise<ThroughputTestResult> {
  assertNotAborted(signal);

  const uploadStartedAt = performance.now();
  const getRemainingUploadMs = () => PHASE_MAX_DURATION_MS - (performance.now() - uploadStartedAt);
  const warmupPayload = createRandomPayload(UPLOAD_WARMUP_BYTES);
  const warmupResult = await retryRequest(
    (attemptSignal) => uploadRequest(warmupPayload, attemptSignal),
    {
      signal,
      timeoutMs: () => Math.min(getUploadTimeoutMs(UPLOAD_WARMUP_BYTES), getRemainingUploadMs()),
      maxRetries: getRemainingUploadMs() > 2_500 ? maxRetries : 0,
    },
  );

  if (!warmupResult.ok) {
    throw new Error("Unable to warm up the Cloudflare upload test.");
  }

  const tracker = createThroughputTracker();
  const totalPlannedBytes = UPLOAD_STAGE_BYTES.reduce((total, bytes) => total + bytes, 0);
  const payloadCache = new Map<number, Blob>();
  const measurements: RequestMeasurement[] = [];
  let retries = 0;
  let failures = 0;

  for (let stageIndex = 0; stageIndex < UPLOAD_STAGE_BYTES.length; stageIndex += 1) {
    assertNotAborted(signal);

    const remainingMs = getRemainingUploadMs();

    if (remainingMs <= 0) {
      break;
    }

    const bytes = UPLOAD_STAGE_BYTES[stageIndex];

    if (!payloadCache.has(bytes)) {
      payloadCache.set(bytes, createRandomPayload(bytes));
    }

    const payload = payloadCache.get(bytes)!;
    const result = await retryRequest(
      (attemptSignal) =>
        uploadRequest(payload, attemptSignal, (deltaBytes) => {
          const snapshot = tracker.record(deltaBytes);
          onProgress?.({
            progress: Math.min(snapshot.transferredBytes / totalPlannedBytes, 1),
            currentMbps: snapshot.currentMbps,
            averageMbps: snapshot.averageMbps,
            transferredBytes: snapshot.transferredBytes,
          });
        }),
      {
        signal,
        timeoutMs: () => Math.min(getUploadTimeoutMs(bytes), getRemainingUploadMs()),
        maxRetries: remainingMs > 2_500 ? maxRetries : 0,
      },
    );

    retries += result.attempts - 1;

    if (result.ok) {
      measurements.push(result.value);
      const measuredBytes = measurements.reduce((total, measurement) => total + measurement.bytes, 0);
      const averageMbps = weightedAverage(
        measurements.map((measurement) => ({ value: measurement.mbps, weight: measurement.bytes })),
      );

      onProgress?.({
        progress: Math.min(Math.max(tracker.transferredBytes, measuredBytes) / totalPlannedBytes, 1),
        currentMbps: result.value.mbps,
        averageMbps,
        transferredBytes: Math.max(tracker.transferredBytes, measuredBytes),
      });
    } else {
      failures += 1;
    }
  }

  if (!measurements.length) {
    const fallbackSpeed = tracker.averageMbps;

    if (fallbackSpeed > 0) {
      return {
        mbps: fallbackSpeed,
        samples: [fallbackSpeed],
        successfulRequests: 0,
        retries,
        failures,
      };
    }

    throw new Error("Unable to complete Cloudflare upload test.");
  }

  const stableMeasurements = filterOutlierMeasurements(measurements);
  const totalBytes = stableMeasurements.reduce((total, measurement) => total + measurement.bytes, 0);
  const totalDurationSeconds = Math.max(
    stableMeasurements.reduce((total, measurement) => total + measurement.durationMs, 0) / 1000,
    0.001,
  );
  const finalSpeed = calculateMbps(totalBytes, totalDurationSeconds);

  onProgress?.({
    progress: 1,
    currentMbps: finalSpeed,
    averageMbps: finalSpeed,
    transferredBytes: tracker.transferredBytes,
  });

  return {
    mbps: finalSpeed,
    samples: measurements.map((measurement) => measurement.mbps),
    successfulRequests: measurements.length,
    retries,
    failures,
  };
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("Aborted", "AbortError");
  }
}

function calculateMbps(totalBytes: number, totalTimeSeconds: number) {
  return (totalBytes * 8) / (totalTimeSeconds * 1e6);
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((total, item) => total + item.weight, 0);
  if (totalWeight <= 0) {
    return average(values.map((item) => item.value));
  }

  return values.reduce((total, item) => total + item.value * item.weight, 0) / totalWeight;
}

function calculateJitter(samples: number[]) {
  if (samples.length < 2) {
    return 0;
  }

  const deltas: number[] = [];

  for (let index = 1; index < samples.length; index += 1) {
    deltas.push(Math.abs(samples[index] - samples[index - 1]));
  }

  return average(deltas);
}

function filterOutlierValues(values: number[]) {
  if (values.length < 3) {
    return [...values];
  }

  const center = median(values);
  const filtered = values.filter((value) => Math.abs(value - center) <= Math.max(center * 0.35, 5));

  if (filtered.length >= Math.max(2, Math.ceil(values.length * 0.6))) {
    return filtered;
  }

  const sorted = [...values].sort((left, right) => left - right);

  if (sorted.length >= 5) {
    return sorted.slice(1, sorted.length - 1);
  }

  return [center];
}

function filterOutlierMeasurements(measurements: RequestMeasurement[]) {
  if (measurements.length < 3) {
    return [...measurements];
  }

  const center = median(measurements.map((measurement) => measurement.mbps));
  const filtered = measurements.filter(
    (measurement) => Math.abs(measurement.mbps - center) <= Math.max(center * 0.35, 1),
  );

  if (filtered.length >= Math.max(2, Math.ceil(measurements.length * 0.6))) {
    return filtered;
  }

  const sorted = [...measurements].sort((left, right) => left.mbps - right.mbps);

  if (sorted.length >= 5) {
    return sorted.slice(1, sorted.length - 1);
  }

  return [sorted[Math.floor(sorted.length / 2)]];
}

function createThroughputTracker() {
  const startedAt = performance.now();
  const samples: Array<{ time: number; bytes: number }> = [];
  let transferredBytes = 0;
  let latestAverageMbps = 0;

  return {
    get transferredBytes() {
      return transferredBytes;
    },
    get averageMbps() {
      return latestAverageMbps;
    },
    record(deltaBytes: number) {
      transferredBytes += deltaBytes;

      const now = performance.now();
      samples.push({ time: now, bytes: transferredBytes });

      while (samples.length > 1 && now - samples[0].time > 1_500) {
        samples.shift();
      }

      const averageMbps = calculateMbps(
        transferredBytes,
        Math.max((now - startedAt) / 1000, 0.001),
      );
      latestAverageMbps = averageMbps;

      let currentMbps = averageMbps;

      if (samples.length > 1) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        currentMbps = calculateMbps(
          last.bytes - first.bytes,
          Math.max((last.time - first.time) / 1000, 0.001),
        );
      }

      return {
        transferredBytes,
        averageMbps,
        currentMbps,
      };
    },
  };
}

async function measureLatencyRequest(signal: AbortSignal) {
  const startedAt = performance.now();
  const response = await fetch(buildDownloadUrl(LATENCY_REQUEST_BYTES), {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Latency request failed with status ${response.status}.`);
  }

  await response.arrayBuffer();
  return performance.now() - startedAt;
}

async function downloadRequest(
  bytes: number,
  signal: AbortSignal,
  onChunk?: (chunkBytes: number) => void,
): Promise<RequestMeasurement> {
  const startedAt = performance.now();
  const response = await fetch(buildDownloadUrl(bytes), {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Download request failed with status ${response.status}.`);
  }

  let receivedBytes = 0;
  const reader = response.body?.getReader();

  if (reader) {
    while (true) {
      assertNotAborted(signal);
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      receivedBytes += value.byteLength;
      onChunk?.(value.byteLength);
    }
  } else {
    const buffer = await response.arrayBuffer();
    receivedBytes = buffer.byteLength;
    onChunk?.(buffer.byteLength);
  }

  const endedAt = performance.now();

  return {
    bytes: receivedBytes,
    durationMs: endedAt - startedAt,
    mbps: calculateMbps(receivedBytes, Math.max((endedAt - startedAt) / 1000, 0.001)),
    startedAt,
    endedAt,
  };
}

async function uploadRequest(
  payload: Blob,
  signal: AbortSignal,
  onDelta?: (deltaBytes: number) => void,
): Promise<RequestMeasurement> {
  const startedAt = performance.now();
  const response = await fetch(`${CLOUDFLARE_UPLOAD_URL}?ts=${Date.now()}-${Math.random().toString(16).slice(2)}`, {
    method: "POST",
    body: payload,
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Upload request failed with status ${response.status}.`);
  }

  await response.arrayBuffer().catch(() => new ArrayBuffer(0));

  const endedAt = performance.now();
  onDelta?.(payload.size);

  return {
    bytes: payload.size,
    durationMs: endedAt - startedAt,
    mbps: calculateMbps(payload.size, Math.max((endedAt - startedAt) / 1000, 0.001)),
    startedAt,
    endedAt,
  };
}

async function retryRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: {
    signal: AbortSignal;
    timeoutMs: number | (() => number);
    maxRetries: number;
  },
): Promise<RetryResult<T>> {
  const { signal, maxRetries } = options;
  let attempts = 0;
  let lastError: unknown = null;

  while (attempts <= maxRetries) {
    assertNotAborted(signal);
    const timeoutMs = resolveTimeoutMs(options.timeoutMs);

    if (timeoutMs <= 0) {
      break;
    }

    attempts += 1;

    const attempt = createAttemptSignal(signal, timeoutMs);

    try {
      const value = await operation(attempt.signal);
      attempt.cleanup();
      return { ok: true, value, attempts };
    } catch (error) {
      attempt.cleanup();

      if (isAbortError(error) && signal.aborted) {
        throw error;
      }

      lastError = error;

      if (attempts > maxRetries) {
        break;
      }

      const nextTimeoutMs = resolveTimeoutMs(options.timeoutMs);

      if (nextTimeoutMs <= 250) {
        break;
      }

      await sleep(Math.min(200 * attempts, 600, nextTimeoutMs), signal);
    }
  }

  return {
    ok: false,
    error: lastError,
    attempts,
  };
}

function resolveTimeoutMs(timeoutMs: number | (() => number)) {
  return Math.max(typeof timeoutMs === "function" ? timeoutMs() : timeoutMs, 0);
}

function createAttemptSignal(signal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();

  const abort = () => {
    controller.abort(signal.reason ?? new DOMException("Aborted", "AbortError"));
  };

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener("abort", abort, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException("Timed out", "AbortError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", abort);
    },
  };
}

function buildDownloadUrl(bytes: number) {
  return `${CLOUDFLARE_DOWNLOAD_URL}?bytes=${bytes}&ts=${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRandomPayload(bytes: number) {
  const data = new Uint8Array(bytes);

  for (let offset = 0; offset < data.length; offset += 65_536) {
    crypto.getRandomValues(data.subarray(offset, Math.min(offset + 65_536, data.length)));
  }

  return new Blob([data]);
}

function getDownloadTimeoutMs(bytes: number) {
  return 8_000 + Math.ceil(bytes / (512 * 1024)) * 1_500;
}

function getUploadTimeoutMs(bytes: number) {
  return 10_000 + Math.ceil(bytes / (512 * 1024)) * 1_800;
}

function deriveAccuracy(
  latencyResult: LatencyTestResult,
  downloadResult: ThroughputTestResult,
  uploadResult: ThroughputTestResult,
): AccuracyLevel {
  let score = 0;

  if (latencyResult.successfulRequests >= 10) {
    score += 2;
  } else if (latencyResult.successfulRequests >= 8) {
    score += 1;
  }

  if (downloadResult.successfulRequests >= 10) {
    score += 2;
  } else if (downloadResult.successfulRequests >= 6) {
    score += 1;
  }

  if (uploadResult.successfulRequests >= 4) {
    score += 2;
  } else if (uploadResult.successfulRequests >= 2) {
    score += 1;
  }

  const totalRetries = latencyResult.retries + downloadResult.retries + uploadResult.retries;
  const totalFailures = latencyResult.failures + downloadResult.failures + uploadResult.failures;

  if (totalRetries <= 2) {
    score += 1;
  }

  if (totalFailures === 0) {
    score += 1;
  }

  if (score >= 7) {
    return "high";
  }

  if (score >= 4) {
    return "medium";
  }

  return "low";
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}
