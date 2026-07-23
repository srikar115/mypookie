"use client";

import { useState } from "react";
import { Pencil, ToggleLeft, ToggleRight, Plus, Save, X, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyCredits: number;
  companionLimit: number;
  memoryLimitTokens: number;
  features: string[];
  modelTier: string;
  isActive: boolean;
  sortOrder: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
}

interface PlanFormState {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyCredits: number;
  companionLimit: number;
  features: string;
  modelTier: string;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
}

function toFormState(plan: Plan): PlanFormState {
  return {
    name: plan.name,
    description: plan.description,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    monthlyCredits: plan.monthlyCredits,
    companionLimit: plan.companionLimit,
    features: plan.features.join("\n"),
    modelTier: plan.modelTier,
    stripePriceIdMonthly: plan.stripePriceIdMonthly,
    stripePriceIdYearly: plan.stripePriceIdYearly,
  };
}

export function AdminPlansClient({ plans: initialPlans }: { plans: Plan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [editing, setEditing] = useState<string | null>(null);
  const [formState, setFormState] = useState<PlanFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const startEdit = (plan: Plan) => {
    setEditing(plan.id);
    setFormState(toFormState(plan));
  };

  const cancelEdit = () => { setEditing(null); setFormState(null); };

  const handleSave = async (planId: string) => {
    if (!formState) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formState,
          features: formState.features.split("\n").map((f) => f.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Plan;
        setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, ...updated } : p)));
        cancelEdit();
        showToast("Plan updated");
      } else {
        showToast("Save failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (plan: Plan) => {
    setTogglingId(plan.id);
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}/toggle`, { method: "POST" });
      if (res.ok) {
        setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, isActive: !p.isActive } : p)));
        showToast(`Plan ${plan.isActive ? "disabled" : "enabled"}`);
      }
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm">
          {toast}
        </div>
      )}

      {plans.map((plan) => (
        <div key={plan.id} className={cn("bg-[#0d0d1a] border rounded-2xl overflow-hidden transition-all", plan.isActive ? "border-white/10" : "border-white/5 opacity-60")}>
          {editing === plan.id && formState ? (
            /* Edit form */
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Editing: {plan.name}</h3>
                <button onClick={cancelEdit} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Name" value={formState.name} onChange={(v) => setFormState({ ...formState, name: v })} />
                <Field label="Model Tier" value={formState.modelTier} onChange={(v) => setFormState({ ...formState, modelTier: v })} />
                <Field label="Monthly Price (cents)" type="number" value={String(formState.monthlyPrice)} onChange={(v) => setFormState({ ...formState, monthlyPrice: parseInt(v) || 0 })} />
                <Field label="Yearly Price (cents)" type="number" value={String(formState.yearlyPrice)} onChange={(v) => setFormState({ ...formState, yearlyPrice: parseInt(v) || 0 })} />
                <Field label="Monthly Credits" type="number" value={String(formState.monthlyCredits)} onChange={(v) => setFormState({ ...formState, monthlyCredits: parseInt(v) || 0 })} />
                <Field label="Companion Limit" type="number" value={String(formState.companionLimit)} onChange={(v) => setFormState({ ...formState, companionLimit: parseInt(v) || 1 })} />
                <Field label="Stripe Price ID (Monthly)" value={formState.stripePriceIdMonthly} onChange={(v) => setFormState({ ...formState, stripePriceIdMonthly: v })} />
                <Field label="Stripe Price ID (Yearly)" value={formState.stripePriceIdYearly} onChange={(v) => setFormState({ ...formState, stripePriceIdYearly: v })} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <input value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Features (one per line)</label>
                <textarea value={formState.features} onChange={(e) => setFormState({ ...formState, features: e.target.value })} rows={5} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50 resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleSave(plan.id)} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <button onClick={cancelEdit} className="px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:bg-white/5">Cancel</button>
              </div>
            </div>
          ) : (
            /* Display row */
            <div className="p-5 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-white">{plan.name}</h3>
                  <span className="text-xs text-gray-600 font-mono">/{plan.slug}</span>
                  {plan.isActive ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500/10 border border-gray-500/20 text-gray-500">disabled</span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mb-3">{plan.description}</p>
                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>${(plan.monthlyPrice / 100).toFixed(2)}/mo · ${(plan.yearlyPrice / 100).toFixed(2)}/yr</span>
                  <span>{plan.monthlyCredits.toLocaleString()} credits/mo</span>
                  <span>{plan.companionLimit} companions</span>
                  <span>tier: {plan.modelTier}</span>
                </div>
                {plan.features.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plan.features.slice(0, 6).map((f, i) => (
                      <span key={i} className="flex items-center gap-1 text-xs text-gray-400">
                        <CheckCircle2 className="w-3 h-3 text-purple-500" />
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(plan)} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleToggle(plan)} disabled={togglingId === plan.id} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors">
                  {togglingId === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : plan.isActive ? (
                    <ToggleRight className="w-4 h-4 text-green-400" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50" />
    </div>
  );
}
