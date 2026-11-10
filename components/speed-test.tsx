"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Clock3, Database, Gauge, Globe2, History, LoaderCircle, MapPin, RotateCcw, Server, ShieldCheck, Trash2 } from "lucide-react";
import ndt7, { type Measurement, type Server as NdtServer } from "@m-lab/ndt7";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Phase = "idle" | "locating" | "download" | "upload" | "complete" | "error";
type TestMode = "full" | "download" | "upload";
type TestResult = { id: string; at: string; download: number; upload: number; ping: number | null; location: string; dataUsed?: number; ip?: string; mode?: TestMode };

const COOKIE_NAME = "speedy_history";
const MAX_HISTORY = 8;

function readHistory(): TestResult[] {
  try {
    const raw = document.cookie.split("; ").find((item) => item.startsWith(`${COOKIE_NAME}=`))?.split("=").slice(1).join("=");
    return raw ? JSON.parse(decodeURIComponent(raw)) : [];
  } catch { return []; }
}

function writeHistory(items: TestResult[]) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(items.slice(0, MAX_HISTORY)))}; Max-Age=2592000; Path=/; SameSite=Lax`;
}

function speedFrom(data: Measurement) {
  if (typeof data.MeanClientMbps === "number") return data.MeanClientMbps;
  if (data.NumBytes && data.ElapsedTime) return (data.NumBytes * 8) / 1_000_000 / data.ElapsedTime;
  return 0;
}

function latencyFrom(data: Measurement) {
  const micros = data.TCPInfo?.MinRTT ?? data.BBRInfo?.MinRTT ?? data.TCPInfo?.RTT;
  return typeof micros === "number" ? micros / 1000 : null;
}

function clientIpFrom(value?: string) {
  if (!value) return "Unavailable";
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  const separator = value.lastIndexOf(":");
  return separator > -1 ? value.slice(0, separator) : value;
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes >= 100_000_000 ? 0 : 1)} MB`;
}

const phaseCopy: Record<Phase, string> = {
  idle: "Ready when you are",
  locating: "Finding the best nearby server",
  download: "Measuring download speed",
  upload: "Measuring upload speed",
  complete: "Test complete",
  error: "Test interrupted",
};

function Meter({ value, phase, onStart, busy }: { value: number; phase: Phase; onStart: () => void; busy: boolean }) {
  const capped = Math.min(value, 500);
  // A logarithmic scale keeps everyday connections visually expressive while
  // still leaving headroom for very fast links.
  const progress = Math.log1p(capped) / Math.log1p(500);
  const status = phase === "upload" ? "Testing upload" : phase === "download" ? "Testing download" : phase === "locating" ? "Finding server" : phase === "complete" ? "Test complete" : phase === "error" ? "Ready to retry" : "Ready to test";
  return (
    <div className="relative mx-auto my-7 aspect-[1.55/1] w-full max-w-[650px] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#f8f9fa] shadow-[0_20px_50px_-36px_rgba(15,23,42,.28)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(163,244,73,.08),transparent_48%)]" />
      <div className="absolute inset-x-6 top-5 z-10 flex items-center justify-between border-b border-slate-200 pb-4 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">
        <span>Live throughput</span><span className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", busy ? "animate-pulse bg-[#65b922]" : phase === "complete" ? "bg-emerald-500" : "bg-slate-300")} />{busy ? "Measuring" : "Optimal"}</span>
      </div>
      <svg viewBox="0 0 600 390" className="relative h-full w-full" aria-label={`${value.toFixed(1)} megabits per second`}>
        <defs>
          <linearGradient id="speedArc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8eea3c" /><stop offset="1" stopColor="#c2ff58" /></linearGradient>
        </defs>
        <path d="M 118 244 A 182 182 0 0 1 482 244" pathLength="100" fill="none" stroke="rgba(15,23,42,.06)" strokeWidth="24" />
        <path d="M 118 244 A 182 182 0 0 1 482 244" pathLength="100" fill="none" stroke="url(#speedArc)" strokeWidth="24" strokeDasharray={`${(progress * 100).toFixed(2)} 100`} className="transition-all duration-300 ease-out" />
        <text x="300" y="193" textAnchor="middle" fill="#0f172a" className="text-[70px] font-semibold tracking-[-5px]">{value > 0 ? value.toFixed(value >= 100 ? 0 : 1) : "-"}</text>
        <text x="300" y="226" textAnchor="middle" fill="#4d9b17" className="text-[14px] font-semibold tracking-[2px]">Mbps</text>
        <text x="300" y="260" textAnchor="middle" fill="#64748b" className="text-[12px]">{status}</text>
        <text x="105" y="270" textAnchor="middle" fill="#94a3b8" className="text-[11px]">0</text>
        <text x="495" y="270" textAnchor="middle" fill="#94a3b8" className="text-[11px]">500+</text>
      </svg>
      <Button size="lg" onClick={onStart} disabled={busy} className="absolute bottom-6 left-1/2 min-w-52 -translate-x-1/2 bg-[#5266ff] text-white shadow-sm hover:bg-[#6577ff]">
        {busy ? <><LoaderCircle className="size-4 animate-spin" /> Testing...</> : phase === "complete" || phase === "error" ? <><RotateCcw className="size-4" /> Test again</> : <><Activity className="size-4" /> Start speed test</>}
      </Button>
    </div>
  );
}

export function SpeedTest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [download, setDownload] = useState(0);
  const [upload, setUpload] = useState(0);
  const [ping, setPing] = useState<number | null>(null);
  const [server, setServer] = useState("Auto-selecting nearest server");
  const [machine, setMachine] = useState("");
  const [history, setHistory] = useState<TestResult[]>([]);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<TestResult | null>(null);
  const [testMode, setTestMode] = useState<TestMode>("full");
  const live = useRef({ download: 0, upload: 0, ping: null as number | null, location: "Nearest M-Lab server", downloadBytes: 0, uploadBytes: 0, ip: "Unavailable" });

  useEffect(() => {
    const id = window.setTimeout(() => setHistory(readHistory()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const handleServer = (chosen: NdtServer) => {
    const place = [chosen.location?.city, chosen.location?.country].filter(Boolean).join(", ") || "Nearest M-Lab server";
    live.current.location = place;
    setServer(place);
    setMachine(chosen.machine || "");
  };

  const handleMeasurement = (kind: "download" | "upload", data: Measurement, source: string) => {
    if (source === "client") {
      const speed = Math.max(0, speedFrom(data));
      live.current[kind] = speed;
      live.current[`${kind}Bytes`] = Math.max(live.current[`${kind}Bytes`], data.NumBytes ?? 0);
      (kind === "download" ? setDownload : setUpload)(speed);
    } else {
      if (data.ConnectionInfo?.Client) live.current.ip = clientIpFrom(data.ConnectionInfo.Client);
      const nextPing = latencyFrom(data);
      if (nextPing !== null && nextPing > 0) {
        live.current.ping = live.current.ping === null ? nextPing : Math.min(live.current.ping, nextPing);
        setPing(live.current.ping);
      }
    }
  };

  const runTest = async () => {
    if (phase === "download" || phase === "upload" || phase === "locating") return;
    live.current = { download: 0, upload: 0, ping: null, location: "Nearest M-Lab server", downloadBytes: 0, uploadBytes: 0, ip: "Unavailable" };
    setDownload(0); setUpload(0); setPing(null); setError(""); setMachine(""); setLastResult(null); setPhase("locating");
    try {
      const config = {
        userAcceptedDataPolicy: true,
        downloadworkerfile: "/ndt7-download-worker.js",
        uploadworkerfile: "/ndt7-upload-worker.js",
        metadata: { client_name: "speedy", client_version: "1.0.0" },
      };
      const callbacks = {
        error: (message: string | Error) => { throw message instanceof Error ? message : new Error(String(message)); },
        serverChosen: handleServer,
        downloadStart: () => setPhase("download" as const),
        downloadMeasurement: ({ Data, Source }: { Data: Measurement; Source: "client" | "server" }) => handleMeasurement("download", Data, Source),
        uploadStart: () => setPhase("upload" as const),
        uploadMeasurement: ({ Data, Source }: { Data: Measurement; Source: "client" | "server" }) => handleMeasurement("upload", Data, Source),
      };
      let code: number;
      if (testMode === "full") {
        code = await ndt7.test(config, callbacks);
      } else {
        const urls = ndt7.discoverServerURLs(config, callbacks);
        code = testMode === "download"
          ? await ndt7.downloadTest(config, callbacks, urls)
          : await ndt7.uploadTest(config, callbacks, urls);
      }
      if (code !== 0) throw new Error("The measurement server could not complete the test.");
      const result: TestResult = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        download: live.current.download,
        upload: live.current.upload,
        ping: live.current.ping,
        location: live.current.location,
        dataUsed: live.current.downloadBytes + live.current.uploadBytes,
        ip: live.current.ip,
        mode: testMode,
      };
      const next = [result, ...readHistory()].slice(0, MAX_HISTORY);
      setLastResult(result); setHistory(next); writeHistory(next); setPhase("complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach the measurement server. Check your connection and try again.");
      setPhase("error");
    }
  };

  const clearHistory = () => { document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`; setHistory([]); };
  const activeValue = phase === "upload" ? upload : download;
  const busy = ["locating", "download", "upload"].includes(phase);

  return (
    <main className="min-h-screen">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-foreground text-white"><Gauge className="size-5" /></span><span className="text-xl font-semibold tracking-tight">speedy.</span></div>
        <a href="#history" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-white hover:text-foreground"><History className="size-4" /> History</a>
      </nav>

      <section className="mx-auto grid max-w-7xl items-start gap-6 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1fr_340px] lg:pt-12">
        <Card className="relative overflow-hidden p-5 sm:p-9 lg:p-12">
          <div className="pointer-events-none absolute -right-40 -top-40 size-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-primary">Internet performance</p><h1 className="max-w-xl text-3xl font-semibold tracking-[-.04em] sm:text-5xl">How fast is your connection?</h1></div>
              <span className={cn("hidden items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium sm:flex", busy ? "border-primary/20 bg-primary/5 text-primary" : "bg-white text-muted-foreground")}><span className={cn("size-2 rounded-full", busy ? "animate-pulse bg-primary" : phase === "complete" ? "bg-emerald-500" : "bg-slate-300")} />{phaseCopy[phase]}</span>
            </div>

            <div className="mx-auto mb-2 flex w-fit rounded-full border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Speed test type">
              {(["full", "download", "upload"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setTestMode(mode)} disabled={busy} aria-pressed={testMode === mode} className={cn("rounded-full px-4 py-2 text-xs font-semibold capitalize transition sm:px-5", testMode === mode ? "bg-slate-900 text-white shadow-sm" : "text-muted-foreground hover:bg-slate-100 hover:text-foreground", busy && "cursor-not-allowed opacity-60")}>
                  {mode === "full" ? "Full test" : `${mode} only`}
                </button>
              ))}
            </div>

            <Meter value={activeValue} phase={phase} onStart={runTest} busy={busy} />

            <div className="mx-auto -mt-1 grid w-full max-w-2xl grid-cols-3 divide-x divide-border rounded-2xl border border-slate-200 bg-white/80 py-5 shadow-[0_12px_35px_-28px_rgba(15,23,42,.45)] backdrop-blur sm:py-6">
              <Stat icon={ArrowDown} label="Download" value={testMode !== "upload" && download ? download.toFixed(1) : "-"} unit="Mbps" active={phase === "download"} />
              <Stat icon={ArrowUp} label="Upload" value={testMode !== "download" && upload ? upload.toFixed(1) : "-"} unit="Mbps" active={phase === "upload"} />
              <Stat icon={Activity} label="Ping" value={ping ? ping.toFixed(0) : "-"} unit="ms" />
            </div>

            {phase === "complete" && lastResult && (
              <div className="mx-auto mt-4 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-center gap-3 rounded-2xl border bg-white/80 px-4 py-3 text-center shadow-sm backdrop-blur"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Database className="size-4" /></span><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data used</p><p className="mt-0.5 font-mono text-sm font-semibold">{typeof lastResult.dataUsed === "number" ? formatBytes(lastResult.dataUsed) : "-"}</p></div></div>
                <div className="flex items-center justify-center gap-3 rounded-2xl border bg-white/80 px-4 py-3 text-center shadow-sm backdrop-blur"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Globe2 className="size-4" /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Public IP address</p><p className="mt-0.5 truncate font-mono text-sm font-semibold">{lastResult.ip}</p></div></div>
              </div>
            )}

            <div className="mt-8 flex flex-col items-center gap-4">
              <p className="max-w-xl text-center text-[11px] leading-5 text-muted-foreground">By starting the test, you agree to M-Lab&apos;s <a className="font-medium text-foreground underline underline-offset-2" href="https://www.measurementlab.net/privacy/" target="_blank" rel="noreferrer">data policy</a>. Your IP address and results are collected and published in its open dataset.</p>
              {error && <p className="max-w-lg rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700">{error}</p>}
            </div>
          </div>
        </Card>

        <aside className="flex w-full flex-col gap-6 self-start">
          <Card className="border-slate-300/80 p-6 shadow-[0_16px_40px_-26px_rgba(15,23,42,.5)]">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Test server</p>
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="size-5" /></span><div><p className="font-semibold">{server}</p><p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{machine || "M-Lab Locate chooses the closest healthy server."}</p></div></div>
            <div className="mt-5 flex items-center gap-2 border-t pt-5 text-xs text-muted-foreground"><Server className="size-4" /> NDT7 single-stream WebSocket test</div>
          </Card>
          <Card className="border-slate-300/80 p-6 shadow-[0_16px_40px_-26px_rgba(15,23,42,.5)]">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Good to know</p>
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div className="flex gap-3"><ShieldCheck className="mt-1 size-4 shrink-0 text-emerald-600" /><p>History stays in this browser as a first-party cookie.</p></div>
              <div className="flex gap-3"><Clock3 className="mt-1 size-4 shrink-0 text-amber-600" /><p>A full test takes about 20 seconds and uses real bandwidth.</p></div>
            </div>
          </Card>
        </aside>
      </section>

      <section id="history" className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="mb-5 flex items-end justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-primary">This browser</p><h2 className="text-2xl font-semibold tracking-tight">Recent tests</h2></div>{history.length > 0 && <Button variant="ghost" size="sm" onClick={clearHistory}><Trash2 className="size-4" /> Clear</Button>}</div>
        {history.length === 0 ? <Card className="grid min-h-40 place-items-center border-dashed bg-transparent text-center text-sm text-muted-foreground"><div><History className="mx-auto mb-3 size-5" /><p>Your completed tests will appear here.</p></div></Card> : <div className="grid gap-3">{history.map((item) => <Card key={item.id} className="grid gap-5 px-5 py-4 lg:grid-cols-[1.15fr_3fr] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{item.location}</p>{item.mode && item.mode !== "full" && <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">{item.mode} only</span>}</div><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at))}</p></div><div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5"><HistoryValue label="Down" value={item.mode === "upload" ? "-" : `${item.download.toFixed(1)} Mbps`} /><HistoryValue label="Up" value={item.mode === "download" ? "-" : `${item.upload.toFixed(1)} Mbps`} /><HistoryValue label="Ping" value={item.ping ? `${item.ping.toFixed(0)} ms` : "-"} /><HistoryValue label="Data used" value={typeof item.dataUsed === "number" ? formatBytes(item.dataUsed) : "Not recorded"} /><HistoryValue label="Public IP" value={item.ip || "Not recorded"} className="col-span-2 sm:col-span-1" /></div></Card>)}</div>}
      </section>
      <footer className="border-t bg-white/50 py-7 text-center text-xs text-muted-foreground">Powered by Measurement Lab&apos;s open NDT7 infrastructure.</footer>
    </main>
  );
}

function Stat({ icon: Icon, label, value, unit, active }: { icon: typeof ArrowDown; label: string; value: string; unit: string; active?: boolean }) {
  return <div className="flex flex-col items-center px-2"><span className={cn("mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", active && "text-primary")}><Icon className="size-4" />{label}</span><span className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{value}</span><span className="mt-1 text-[10px] font-medium text-muted-foreground">{unit}</span></div>;
}

function HistoryValue({ label, value, className }: { label: string; value: string; className?: string }) {
  return <div className={cn("min-w-0 text-left", className)}><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 truncate font-mono text-sm font-medium" title={value}>{value}</p></div>;
}
