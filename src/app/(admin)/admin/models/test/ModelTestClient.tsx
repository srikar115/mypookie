"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import Image from "next/image";

interface ModelInfo {
  id: string;
  name: string;
  slug: string;
  externalModelId: string;
  modelType: "CHAT" | "IMAGE" | "VIDEO";
  providerName: string;
  providerSlug: string;
  secretKeyRef?: string;
  supportsStreaming: boolean;
  supportsAsync: boolean;
}

interface TestResult {
  success: boolean;
  error?: string;
  latencyMs?: number;
  // chat
  content?: string;
  inputTokens?: number;
  outputTokens?: number;
  // image
  url?: string;
  // video
  jobId?: string;
  status?: string;
}

type TestState = "idle" | "running" | "polling" | "done" | "failed";

const MODEL_TYPE_COLORS: Record<string, string> = {
  CHAT: "bg-blue-500/15 text-blue-300 border-blue-500/20",
  IMAGE: "bg-pink-500/15 text-pink-300 border-pink-500/20",
  VIDEO: "bg-violet-500/15 text-violet-300 border-violet-500/20",
};

export function ModelTestClient({ models }: { models: ModelInfo[] }) {
  const [selectedId, setSelectedId] = useState<string>(models[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<string>("square");
  const [duration, setDuration] = useState(5);
  const [state, setState] = useState<TestState>("idle");
  const [result, setResult] = useState<TestResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = models.find((m) => m.id === selectedId);

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  const run = async () => {
    if (!selected || !prompt.trim()) return;
    setState("running");
    setResult(null);

    const body: Record<string, unknown> = {
      modelId: selected.id,
      modelType: selected.modelType,
      prompt: prompt.trim(),
    };
    if (selected.modelType === "CHAT" && systemPrompt.trim()) body.systemPrompt = systemPrompt.trim();
    if (selected.modelType === "IMAGE") body.aspectRatio = aspectRatio;
    if (selected.modelType === "VIDEO") { body.aspectRatio = aspectRatio; body.durationSeconds = duration; }

    try {
      const res = await fetch("/api/admin/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success: boolean; error?: string; result?: {
        content?: string; url?: string; jobId?: string; status?: string;
        latencyMs?: number; inputTokens?: number; outputTokens?: number;
      } };

      if (!data.success || !res.ok) {
        setState("failed");
        setResult({ success: false, error: data.error ?? "Request failed" });
        return;
      }

      const r = data.result ?? {};

      if (selected.modelType === "VIDEO" && r.jobId && r.status !== "completed") {
        setState("polling");
        setResult({ success: true, jobId: r.jobId, status: r.status, latencyMs: r.latencyMs });
        pollJobStatus(r.jobId);
        return;
      }

      setState("done");
      setResult({ success: true, ...r });
    } catch (err) {
      setState("failed");
      setResult({ success: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const pollJobStatus = (jobId: string) => {
    if (!selected) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/models/test?jobId=${encodeURIComponent(jobId)}&modelId=${selected.id}`);
        const data = await res.json() as { success: boolean; result?: { status: string; resultUrl?: string; jobId: string } };
        if (data.success && data.result) {
          setResult((prev) => ({ ...prev, success: true, ...data.result, url: data.result!.resultUrl }));
          if (data.result.status === "completed" || data.result.status === "failed") {
            setState(data.result.status === "completed" ? "done" : "failed");
            return;
          }
        }
      } catch { /* continue polling */ }
      pollRef.current = setTimeout(poll, 4000);
    };
    pollRef.current = setTimeout(poll, 4000);
  };

  const canRun = !!selected && !!prompt.trim() && state !== "running" && state !== "polling";

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* ── Left: config ── */}
      <div className="lg:col-span-2 space-y-4">
        {/* Model selector */}
        <div className="border border-white/10 rounded-xl p-4 bg-[#0e0e18] space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Select Model</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setSelectedId(m.id); setState("idle"); setResult(null); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                  selectedId === m.id
                    ? "border-purple-500/50 bg-purple-500/10"
                    : "border-white/5 hover:border-white/15 hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${MODEL_TYPE_COLORS[m.modelType]}`}>
                    {m.modelType}
                  </span>
                  <span className="text-sm text-white truncate">{m.name}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 font-mono truncate">{m.providerName} · {m.externalModelId}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        {selected && (
          <div className="border border-white/10 rounded-xl p-4 bg-[#0e0e18] space-y-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Test Input</p>

            {selected.modelType === "CHAT" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">System Prompt (optional)</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  placeholder="You are a helpful assistant..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white resize-none focus:outline-none focus:border-purple-500/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {selected.modelType === "CHAT" ? "User Message *" : "Prompt *"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder={
                  selected.modelType === "CHAT"
                    ? "Hello! How are you today?"
                    : selected.modelType === "IMAGE"
                    ? "A beautiful sunset over mountains, cinematic lighting"
                    : "A person walking through a forest in slow motion"
                }
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white resize-none focus:outline-none focus:border-purple-500/50"
              />
            </div>

            {(selected.modelType === "IMAGE" || selected.modelType === "VIDEO") && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
                  className="w-full px-3 py-2 bg-[#12121a] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="square">Square (1:1)</option>
                  <option value="portrait">Portrait (9:16)</option>
                  <option value="landscape">Landscape (16:9)</option>
                  <option value="4:3">Landscape (4:3)</option>
                  <option value="3:4">Portrait (3:4)</option>
                </select>
              </div>
            )}

            {selected.modelType === "VIDEO" && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Duration (seconds)</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#12121a] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value={5}>5s</option>
                  <option value={8}>8s</option>
                  <option value={10}>10s</option>
                </select>
              </div>
            )}

            <button
              type="button"
              disabled={!canRun}
              onClick={run}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {state === "running" || state === "polling" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {state === "polling" ? "Polling…" : "Running…"}</>
              ) : (
                <><Play className="w-4 h-4" /> Run Test</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Right: results ── */}
      <div className="lg:col-span-3">
        <div className="border border-white/10 rounded-xl p-4 bg-[#0e0e18] min-h-80">
          {state === "idle" && (
            <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
              Select a model and enter a prompt to test
            </div>
          )}

          {(state === "running" || state === "polling") && !result && (
            <div className="flex items-center justify-center h-64 gap-2 text-gray-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              {state === "polling" ? "Waiting for video job…" : "Sending request…"}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Status bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.success && (state === "done")
                    ? <CheckCircle className="w-4 h-4 text-green-400" />
                    : result.success && state === "polling"
                    ? <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                  <span className={`text-sm font-medium ${
                    result.success && state === "done" ? "text-green-400" :
                    result.success && state === "polling" ? "text-yellow-400" : "text-red-400"
                  }`}>
                    {result.success && state === "done" ? "Success" :
                     result.success && state === "polling" ? `Processing · ${result.status ?? "queued"}` :
                     "Failed"}
                  </span>
                </div>
                {result.latencyMs !== undefined && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {result.latencyMs}ms
                  </span>
                )}
              </div>

              {/* Error */}
              {result.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  <p className="text-sm text-red-300">{result.error}</p>
                </div>
              )}

              {/* Chat response */}
              {result.content && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-medium">Response</p>
                  <div className="bg-white/5 rounded-lg p-4 text-sm text-gray-100 whitespace-pre-wrap leading-relaxed">
                    {result.content}
                  </div>
                  {(result.inputTokens !== undefined || result.outputTokens !== undefined) && (
                    <p className="text-xs text-gray-500">
                      Tokens: {result.inputTokens ?? "?"} in · {result.outputTokens ?? "?"} out
                    </p>
                  )}
                </div>
              )}

              {/* Image result */}
              {result.url && selected?.modelType === "IMAGE" && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-medium">Generated Image</p>
                  <div className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10">
                    <Image
                      src={result.url}
                      alt="Generated test image"
                      width={512}
                      height={512}
                      className="w-full object-contain max-h-96"
                      unoptimized
                    />
                  </div>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-400 hover:underline break-all"
                  >
                    {result.url.startsWith("data:") ? "(base64 image)" : result.url}
                  </a>
                </div>
              )}

              {/* Video result */}
              {selected?.modelType === "VIDEO" && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-medium">Video Job</p>
                  <div className="bg-white/5 rounded-lg p-3 space-y-1 font-mono text-xs">
                    <p className="text-gray-400">Job ID: <span className="text-white break-all">{result.jobId}</span></p>
                    <p className="text-gray-400">Status: <span className="text-white">{result.status}</span></p>
                  </div>
                  {result.url && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-medium">Video URL</p>
                      <video
                        src={result.url}
                        controls
                        className="w-full rounded-xl bg-black border border-white/10"
                      />
                    </div>
                  )}
                  {state === "polling" && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Polling every 4 seconds…
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
