"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, ChevronLeft, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

interface Provider { id: string; name: string; slug: string; }

interface ModelData {
  id?: string;
  name: string;
  slug: string;
  providerId: string;
  modelType: "CHAT" | "IMAGE" | "VIDEO";
  externalModelId: string;
  creditCostPerCall: number;
  supportsStreaming: boolean;
  supportsAsync: boolean;
  isEnabled: boolean;
  safetyTier: string;
  description: string;
  capabilities: string;
  inputSchema: string;
  outputSchema: string;
  settings: string;
}

interface Props {
  providers: Provider[];
  model?: Omit<ModelData, "capabilities" | "inputSchema" | "outputSchema" | "settings"> & {
    capabilities?: unknown;
    inputSchema?: unknown;
    outputSchema?: unknown;
    settings?: unknown;
  };
}

function jsonToString(value: unknown): string {
  if (!value || (typeof value === "object" && Object.keys(value as object).length === 0)) return "";
  try { return JSON.stringify(value, null, 2); } catch { return ""; }
}

function parseJsonField(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { return undefined; }
}

function JsonEditor({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const isInvalid = value.trim() !== "" && !parseJsonField(value);
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        className={`w-full px-3 py-2 bg-white/5 border rounded-lg text-xs text-white font-mono focus:outline-none resize-y ${
          isInvalid ? "border-red-500/60" : "border-white/10 focus:border-purple-500/50"
        }`}
        placeholder={placeholder}
        spellCheck={false}
      />
      {isInvalid && <p className="text-xs text-red-400 mt-0.5">Invalid JSON</p>}
    </div>
  );
}

export function ModelFormClient({ providers, model }: Props) {
  const router = useRouter();
  const isEdit = !!model?.id;

  const [form, setForm] = useState<ModelData>({
    name: model?.name ?? "",
    slug: model?.slug ?? "",
    providerId: model?.providerId ?? providers[0]?.id ?? "",
    modelType: model?.modelType ?? "CHAT",
    externalModelId: model?.externalModelId ?? "",
    creditCostPerCall: model?.creditCostPerCall ?? 1,
    supportsStreaming: model?.supportsStreaming ?? true,
    supportsAsync: model?.supportsAsync ?? false,
    isEnabled: model?.isEnabled ?? true,
    safetyTier: model?.safetyTier ?? "standard",
    description: model?.description ?? "",
    capabilities: jsonToString(model?.capabilities),
    inputSchema: jsonToString(model?.inputSchema),
    outputSchema: jsonToString(model?.outputSchema),
    settings: jsonToString(model?.settings),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate JSON fields
    const jsonFields = ["capabilities", "inputSchema", "outputSchema", "settings"] as const;
    for (const field of jsonFields) {
      if (form[field].trim() && !parseJsonField(form[field])) {
        setError(`${field}: invalid JSON. Please fix before saving.`);
        return;
      }
    }

    setSaving(true);
    try {
      const url = isEdit ? `/api/admin/models/${model!.id}` : "/api/admin/models";
      const method = isEdit ? "PATCH" : "POST";

      const payload = {
        name: form.name,
        slug: form.slug,
        providerId: form.providerId,
        modelType: form.modelType,
        externalModelId: form.externalModelId,
        creditCostPerCall: form.creditCostPerCall,
        supportsStreaming: form.supportsStreaming,
        supportsAsync: form.supportsAsync,
        isEnabled: form.isEnabled,
        safetyTier: form.safetyTier,
        description: form.description,
        capabilities: parseJsonField(form.capabilities),
        inputSchema: parseJsonField(form.inputSchema),
        outputSchema: parseJsonField(form.outputSchema),
        settings: parseJsonField(form.settings),
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error ?? "Save failed"); return; }
      router.push("/admin/models");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const settingsPlaceholder = form.modelType === "CHAT"
    ? `{\n  "temperature": 0.85,\n  "max_tokens": 900,\n  "top_p": 0.95\n}`
    : form.modelType === "IMAGE"
    ? `{\n  "defaultInput": {\n    "aspect_ratio": "9:16"\n  },\n  "resultPath": "images.0.url"\n}`
    : `{\n  "defaultInput": {\n    "aspect_ratio": "9:16",\n    "duration": "5"\n  },\n  "resultPath": "video.url"\n}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ── Basic fields ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Model Name *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: isEdit ? form.slug : autoSlug(e.target.value) })}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
            placeholder="e.g. Qwen 2.5 72B"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Slug *</label>
          <input
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 font-mono"
            placeholder="e.g. qwen-2-5-72b"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Provider *</label>
          <select
            value={form.providerId}
            onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            className="w-full px-3 py-2 bg-[#12121a] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
          >
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Model Type *</label>
          <select
            value={form.modelType}
            onChange={(e) => setForm({ ...form, modelType: e.target.value as "CHAT" | "IMAGE" | "VIDEO" })}
            className="w-full px-3 py-2 bg-[#12121a] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
          >
            <option value="CHAT">Chat</option>
            <option value="IMAGE">Image</option>
            <option value="VIDEO">Video</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">
            External Model ID
            <span className="ml-1 text-[10px] text-gray-500">(OpenRouter: e.g. qwen/qwen-2.5-72b-instruct · fal: e.g. fal-ai/flux/dev)</span>
          </label>
          <input
            value={form.externalModelId}
            onChange={(e) => setForm({ ...form, externalModelId: e.target.value })}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 font-mono"
            placeholder="e.g. qwen/qwen-2.5-72b-instruct"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Credit Cost Per Call</label>
          <input
            type="number"
            min={0}
            value={form.creditCostPerCall}
            onChange={(e) => setForm({ ...form, creditCostPerCall: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Safety Tier</label>
          <select
            value={form.safetyTier}
            onChange={(e) => setForm({ ...form, safetyTier: e.target.value })}
            className="w-full px-3 py-2 bg-[#12121a] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
          >
            <option value="strict">Strict</option>
            <option value="standard">Standard</option>
            <option value="creative">Creative</option>
            <option value="expressive">Expressive</option>
            <option value="roleplay">Roleplay</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
          placeholder="Optional description"
        />
      </div>

      {/* ── Toggles ── */}
      <div className="flex flex-wrap gap-4">
        {([
          { key: "isEnabled", label: "Enabled" },
          { key: "supportsStreaming", label: "Supports Streaming" },
          { key: "supportsAsync", label: "Supports Async" },
        ] as const).map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setForm({ ...form, [key]: !form[key] })}
              className={`relative w-10 h-5 rounded-full transition-colors ${form[key] ? "bg-purple-600" : "bg-white/10"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form[key] ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
            <span className="text-sm text-gray-300">{label}</span>
          </label>
        ))}
      </div>

      {/* ── Settings JSON (most important — always visible) ── */}
      <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-3">
        <p className="text-xs font-medium text-gray-300">Settings JSON</p>
        <p className="text-[11px] text-gray-500 -mt-1">
          Controls provider-specific behaviour: temperature, max_tokens (chat) or defaultInput / resultPath (fal).
        </p>
        <JsonEditor
          label=""
          value={form.settings}
          onChange={(v) => setForm({ ...form, settings: v })}
          placeholder={settingsPlaceholder}
        />
      </div>

      {/* ── Advanced (collapsible) ── */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Advanced JSON editors (capabilities, inputSchema, outputSchema)
      </button>

      {showAdvanced && (
        <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-4">
          <JsonEditor
            label="Capabilities"
            value={form.capabilities}
            onChange={(v) => setForm({ ...form, capabilities: v })}
            placeholder='{ "vision": false, "function_calling": true }'
          />
          <JsonEditor
            label="Input Schema"
            value={form.inputSchema}
            onChange={(v) => setForm({ ...form, inputSchema: v })}
            placeholder='{ "type": "object", "properties": { "prompt": { "type": "string" } } }'
          />
          <JsonEditor
            label="Output Schema"
            value={form.outputSchema}
            onChange={(v) => setForm({ ...form, outputSchema: v })}
            placeholder='{ "type": "object", "properties": { "url": { "type": "string" } } }'
          />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3 pt-2">
        <Link
          href="/admin/models"
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Link>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "Save Changes" : "Create Model"}
        </button>
      </div>
    </form>
  );
}
