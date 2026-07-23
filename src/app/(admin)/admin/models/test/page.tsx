import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ModelTestClient } from "./ModelTestClient";

export const metadata = { title: "Test Models — Admin" };

export default async function AdminModelTestPage() {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "ADMIN") redirect("/app");

  const models = await prisma.aiModel.findMany({
    where: { isEnabled: true },
    include: { provider: true },
    orderBy: [{ modelType: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f0ff]">Model Tester</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Test enabled models directly. No credits are deducted. All tests are logged.
        </p>
      </div>
      <ModelTestClient models={models.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        externalModelId: m.externalModelId,
        modelType: m.modelType as "CHAT" | "IMAGE" | "VIDEO",
        providerName: m.provider.name,
        providerSlug: m.provider.slug,
        secretKeyRef: m.provider.secretKeyRef ?? undefined,
        supportsStreaming: m.supportsStreaming,
        supportsAsync: m.supportsAsync,
      }))} />
    </div>
  );
}
