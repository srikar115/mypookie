import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanionAdminForm } from "../../CompanionAdminForm";
import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export const metadata = { title: "Edit Companion — Admin" };

export default async function EditCompanionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companion = await prisma.companion.findUnique({ where: { id } });
  if (!companion) notFound();

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <Link
          href="/admin/companions"
          className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#c4c2d4] mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Companions
        </Link>
        <h1 className="text-2xl font-bold text-[#f1f0ff] flex items-center gap-2">
          <Pencil className="h-5 w-5 text-purple-400" />
          Edit — {companion.name}
        </h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Changes take effect immediately. Avatar regeneration is triggered separately.
        </p>
      </div>

      {/* Current avatar preview */}
      {companion.avatarUrl && (
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-[#2a2a3d] shrink-0">
            <Image
              src={companion.avatarUrl}
              alt={companion.name}
              fill
              className="object-cover object-top"
              unoptimized
            />
          </div>
          <p className="text-xs text-[#6b7280]">
            Current avatar. Use the <strong className="text-[#c4c2d4]">Generate Avatar</strong> button on the
            companions list to regenerate after editing appearance.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Companion Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanionAdminForm
            mode="edit"
            companionId={id}
            initialData={{
              name: companion.name,
              companionType: companion.companionType ?? "",
              genderPresentation: companion.genderPresentation ?? "",
              ageStyle: companion.ageStyle ?? "",
              relationshipStyle: companion.relationshipStyle ?? "",
              greetingStyle: companion.greetingStyle ?? "",
              personalityPreset: companion.personalityPreset ?? "",
              visualStyle: companion.visualStyle ?? "",
              hairColor: companion.hairColor ?? "",
              hairstyle: companion.hairstyle ?? "",
              eyeColor: companion.eyeColor ?? "",
              buildStyle: companion.buildStyle ?? "",
              fashionStyle: companion.fashionStyle ?? "",
              overallVibe: companion.overallVibe ?? "",
              customAppearanceNotes: companion.customAppearanceNotes ?? "",
              conversationTone: companion.conversationTone ?? "",
              intimacyLevel: companion.intimacyLevel ?? "",
              isPublic: companion.isPublic,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
