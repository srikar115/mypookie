import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { ModelFormClient } from "../../ModelFormClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Edit Model" };

export default async function EditModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [model, providers] = await Promise.all([
    prisma.aiModel.findUnique({ where: { id }, include: { provider: true } }),
    prisma.aiProvider.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!model) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Edit Model</h1>
        <p className="text-sm text-gray-400 mt-1">{model.name}</p>
      </div>
      <ModelFormClient
        providers={providers.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))}
        model={{
          id: model.id,
          name: model.name,
          slug: model.slug,
          providerId: model.providerId,
          modelType: model.modelType,
          externalModelId: model.externalModelId ?? "",
          creditCostPerCall: model.creditCostPerCall,
          supportsStreaming: model.supportsStreaming,
          supportsAsync: model.supportsAsync,
          isEnabled: model.isEnabled,
          safetyTier: model.safetyTier,
          description: model.description ?? "",
        }}
      />
    </div>
  );
}
