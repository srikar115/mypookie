"use client";

import { useState } from "react";
import { Pencil, ToggleLeft, ToggleRight, Save, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pack {
  id: string;
  name: string;
  slug: string;
  description: string;
  credits: number;
  bonusCredits: number;
  price: number;
  currency: string;
  stripePriceId: string;
  isEnabled: boolean;
  sortOrder: number;
}

export function AdminCreditPacksClient({ packs: initial }: { packs: Pack[] }) {
  const [packs, setPacks] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Pack> | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const startEdit = (pack: Pack) => { setEditing(pack.id); setForm({ ...pack }); };
  const cancelEdit = () => { setEditing(null); setForm(null); };

  const handleSave = async (id: string) => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/credit-packs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const updated = (await res.json()) as Pack;
        setPacks((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
        cancelEdit();
        showToast("Pack updated");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pack: Pack) => {
    setTogglingId(pack.id);
    try {
      const res = await fetch(`/api/admin/credit-packs/${pack.id}/toggle`, { method: "POST" });
      if (res.ok) {
        setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, isEnabled: !p.isEnabled } : p)));
        showToast(`Pack ${pack.isEnabled ? "disabled" : "enabled"}`);
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">{toast}</div>
      )}

      {packs.map((pack) => (
        <div key={pack.id} className={cn("bg-[#0d0d1a] border rounded-2xl overflow-hidden", pack.isEnabled ? "border-white/10" : "border-white/5 opacity-60")}>
          {editing === pack.id && form ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Editing: {pack.name}</h3>
                <button onClick={cancelEdit}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <F label="Name" value={form.name ?? ""} onChange={(v) => setForm({ ...form, name: v })} />
                <F label="Slug" value={form.slug ?? ""} onChange={(v) => setForm({ ...form, slug: v })} />
                <F label="Credits" type="number" value={String(form.credits ?? 0)} onChange={(v) => setForm({ ...form, credits: parseInt(v) || 0 })} />
                <F label="Bonus Credits" type="number" value={String(form.bonusCredits ?? 0)} onChange={(v) => setForm({ ...form, bonusCredits: parseInt(v) || 0 })} />
                <F label="Price (cents)" type="number" value={String(form.price ?? 0)} onChange={(v) => setForm({ ...form, price: parseInt(v) || 0 })} />
                <F label="Currency" value={form.currency ?? "usd"} onChange={(v) => setForm({ ...form, currency: v })} />
                <F label="Stripe Price ID" value={form.stripePriceId ?? ""} onChange={(v) => setForm({ ...form, stripePriceId: v })} />
              </div>
              <F label="Description" value={form.description ?? ""} onChange={(v) => setForm({ ...form, description: v })} />
              <div className="flex gap-3">
                <button onClick={() => handleSave(pack.id)} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <button onClick={cancelEdit} className="px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white">{pack.name}</h3>
                  <span className="text-xs text-gray-600 font-mono">/{pack.slug}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full border", pack.isEnabled ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-gray-500/10 border-gray-500/20 text-gray-500")}>
                    {pack.isEnabled ? "enabled" : "disabled"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>{pack.credits.toLocaleString()} credits{pack.bonusCredits > 0 ? ` +${pack.bonusCredits} bonus` : ""}</span>
                  <span>${(pack.price / 100).toFixed(2)} {pack.currency.toUpperCase()}</span>
                  {pack.stripePriceId && <span className="text-green-600">✓ Stripe configured</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(pack)} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleToggle(pack)} disabled={togglingId === pack.id} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors">
                  {togglingId === pack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : pack.isEnabled ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function F({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
    </div>
  );
}
