import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModelDefaultSelector } from "@/components/admin/ModelDefaultSelector";
import { ModelToggle } from "@/components/admin/ModelToggle";
import { Cpu, Plus, FlaskConical, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "AI Models — Admin" };

const PROVIDER_KEY_REFS: Record<string, string> = {
  openai:      "OPENAI_API_KEY",
  anthropic:   "ANTHROPIC_API_KEY",
  openrouter:  "OPENROUTER_API_KEY",
  stability:   "STABILITY_API_KEY",
  runway:      "RUNWAY_API_KEY",
  kling:       "KLING_API_KEY",
  fal:         "FAL_KEY",
};

function hasProviderKey(slug: string, secretKeyRef?: string | null): boolean {
  const envVar = secretKeyRef || PROVIDER_KEY_REFS[slug];
  if (!envVar) return false;
  return !!(process.env[envVar]?.trim());
}

export default async function AdminModelsPage() {
  const session = await auth();
  const adminId = session?.user?.id as string;

  const [models, defaults, providers] = await Promise.all([
    prisma.aiModel.findMany({
      include: { provider: true },
      orderBy: [{ modelType: "asc" }, { name: "asc" }],
    }),
    prisma.modelDefault.findMany({ include: { model: true } }),
    prisma.aiProvider.findMany({ orderBy: { name: "asc" } }),
  ]);

  const defaultMap = Object.fromEntries(
    defaults.map((d) => [d.modelType, d.model])
  );

  const chatModels   = models.filter((m) => m.modelType === "CHAT");
  const imageModels  = models.filter((m) => m.modelType === "IMAGE");
  const videoModels  = models.filter((m) => m.modelType === "VIDEO");

  // Which providers have keys missing
  const missingKeyProviders = providers.filter(
    (p) => p.isEnabled && !hasProviderKey(p.slug, p.secretKeyRef) && p.slug !== "mock"
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f0ff]">AI Models</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">{models.length} models configured</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/models/test">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <FlaskConical className="h-4 w-4" />
              Test Models
            </Button>
          </Link>
          <Link href="/admin/models/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          </Link>
        </div>
      </div>

      {/* Provider API key warnings */}
      {missingKeyProviders.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-300 font-medium">Missing provider API keys</p>
            <p className="text-xs text-amber-400/80 mt-0.5">
              The following enabled providers have no API key configured — their models will use mock fallback in development
              and return an error in production:{" "}
              {missingKeyProviders.map((p, i) => (
                <span key={p.id}>
                  <span className="font-mono">{p.name}</span>
                  {" "}({PROVIDER_KEY_REFS[p.slug] ?? p.secretKeyRef ?? "unknown env var"})
                  {i < missingKeyProviders.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Current defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4 text-amber-400" />
            Active Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-[#6b7280]">
            These models are used for all user requests. Only enabled models can be set as default.
            Changes take effect immediately.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {(["CHAT", "IMAGE", "VIDEO"] as const).map((type) => {
              const current = defaultMap[type] ?? null;
              const providerSlug = models.find((m) => m.id === current?.id)?.provider?.slug;
              const missingKey = providerSlug && !hasProviderKey(providerSlug);
              return (
                <div key={type}>
                  <ModelDefaultSelector
                    modelType={type}
                    currentDefault={current}
                    availableModels={models.filter((m) => m.modelType === type && m.isEnabled)}
                    adminId={adminId}
                  />
                  {missingKey && (
                    <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-1.5">
                      <AlertTriangle className="w-3 h-3" />
                      Provider key missing — will use mock fallback
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Model tables */}
      {[
        { label: "Chat Models",  models: chatModels },
        { label: "Image Models", models: imageModels },
        { label: "Video Models", models: videoModels },
      ].map(({ label, models: typeModels }) => (
        <Card key={label}>
          <CardHeader>
            <CardTitle className="text-sm">{label}</CardTitle>
          </CardHeader>
          <CardContent>
            {typeModels.length === 0 ? (
              <p className="text-sm text-[#6b7280] text-center py-4">
                No {label.toLowerCase()} configured.{" "}
                <Link href="/admin/models/new" className="text-purple-400 hover:underline">Add one</Link>
              </p>
            ) : (
              <div className="space-y-3">
                {typeModels.map((model) => {
                  const keyMissing = !hasProviderKey(model.provider.slug, model.provider.secretKeyRef);
                  const isDefault = defaults.some((d) => d.modelId === model.id);
                  return (
                    <div
                      key={model.id}
                      className="flex items-center justify-between py-3 border-b border-[#1a1a26] last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#f1f0ff]">{model.name}</p>
                          {isDefault && <Badge variant="warning" className="text-[10px]">Default</Badge>}
                          {keyMissing && model.isEnabled && model.provider.slug !== "mock" && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              Key missing
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6b7280] truncate">
                          {model.provider.name} · <span className="font-mono">{model.externalModelId || "—"}</span> · {model.creditCostPerCall} credits · {model.safetyTier}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-3 shrink-0">
                        <Badge variant={model.isEnabled ? "success" : "secondary"}>
                          {model.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <ModelToggle modelId={model.id} isEnabled={model.isEnabled} />
                        <Link href={`/admin/models/${model.id}/edit`}>
                          <Button variant="ghost" size="sm" className="text-xs">Edit</Button>
                        </Link>
                        {model.isEnabled && (
                          <Link href={`/admin/models/test?modelId=${model.id}`}>
                            <Button variant="ghost" size="sm" className="text-xs text-purple-400">
                              <FlaskConical className="w-3 h-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
