import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getCompanionById } from "@/lib/companions/companionService";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditCompanionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const companion = await getCompanionById(id, session.user.id as string);
  if (!companion) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href={`/app/companions/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-[#f1f0ff]">Edit {companion.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Edit Companion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#6b7280]">
            Full editing wizard coming in the next iteration. For now, you can edit your companion&apos;s memory directly.
          </p>
          <div className="mt-4 flex gap-3">
            <Link href={`/app/companions/${id}/memory`}>
              <Button variant="secondary">Edit Memory</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
