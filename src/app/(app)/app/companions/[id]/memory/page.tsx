import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getCompanionById } from "@/lib/companions/companionService";
import { getMemory } from "@/lib/memory/memoryService";
import { MemoryEditor } from "@/components/companions/MemoryEditor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function MemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const companion = await getCompanionById(id, session.user.id as string);
  if (!companion) notFound();

  const memory = await getMemory(id, session.user.id as string);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href={`/app/companions/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#f1f0ff]">
          Memory — {companion.name}
        </h1>
      </div>

      <MemoryEditor
        companionId={id}
        initialMarkdown={memory?.memoryMarkdown ?? ""}
        version={memory?.version ?? 1}
      />
    </div>
  );
}
