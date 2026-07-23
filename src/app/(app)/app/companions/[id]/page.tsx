import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getCompanionById } from "@/lib/companions/companionService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, Settings, ArrowLeft, Brain, Eye, Heart, Camera } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { RegenerateLookButton } from "./RegenerateLookButton";

export default async function CompanionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const companion = await getCompanionById(id, session.user.id as string);
  if (!companion) notFound();

  const traits = companion.personalityTraits as Record<string, number>;
  const topTraits = Object.entries(traits)
    .filter(([, v]) => v >= 60)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/app/companions">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back to Companions
        </Button>
      </Link>

      {/* Profile card */}
      <div className="rounded-xl border border-[#2a2a3d] bg-[#12121a] overflow-hidden">
        <div className="h-32 bg-gradient-to-br from-purple-950/40 to-pink-950/30 flex items-end px-6 pb-0">
          <div className="relative translate-y-10">
            {companion.avatarUrl ? (
              <Image
                src={companion.avatarUrl}
                alt={companion.name}
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover shadow-xl border-4 border-[#12121a]"
                unoptimized
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-pink-400 text-4xl shadow-xl border-4 border-[#12121a]">
                ✨
              </div>
            )}
          </div>
        </div>
        <div className="px-6 pt-14 pb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-[#f1f0ff]">{companion.name}</h1>
              <p className="text-sm text-[#6b7280]">
                {companion.companionType} · {companion.genderPresentation} · {companion.ageStyle}
              </p>
            </div>
            <Badge variant={companion.status === "ACTIVE" ? "success" : "secondary"}>
              {companion.status.toLowerCase()}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={`/app/chat/${companion.id}`}>
              <Button>
                <MessageCircle className="h-4 w-4" />
                Start Chat
              </Button>
            </Link>
            <Link href={`/app/companions/${companion.id}/edit`}>
              <Button variant="secondary">
                <Settings className="h-4 w-4" />
                Edit
              </Button>
            </Link>
            <RegenerateLookButton companionId={companion.id} />
          </div>

          {!companion.avatarUrl && (
            <p className="mt-3 text-xs text-[#4b5563] flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Profile image is being generated in the background…
            </p>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4 text-pink-400" />
              Relationship
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Style", value: companion.relationshipStyle },
              { label: "Greeting", value: companion.greetingStyle },
              { label: "Tone", value: companion.conversationTone },
              { label: "Intimacy", value: companion.intimacyLevel },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-[#6b7280]">{item.label}</span>
                <span className="text-[#c4c2d4] text-right max-w-40 truncate">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-400" />
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Style", value: companion.visualStyle },
              { label: "Hair", value: `${companion.hairColor}, ${companion.hairstyle}` },
              { label: "Eyes", value: companion.eyeColor },
              { label: "Build", value: companion.buildStyle },
              { label: "Fashion", value: companion.fashionStyle },
              { label: "Vibe", value: companion.overallVibe },
            ].map((item) => (
              <div key={item.label} className="flex justify-between">
                <span className="text-[#6b7280]">{item.label}</span>
                <span className="text-[#c4c2d4] text-right max-w-40 truncate">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Personality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" />
            Personality
          </CardTitle>
        </CardHeader>
        <CardContent>
          {companion.personalityPreset && (
            <p className="text-sm text-[#9ca3af] mb-4">
              Preset: <span className="text-[#c4c2d4]">{companion.personalityPreset}</span>
            </p>
          )}
          <div className="space-y-3">
            {topTraits.map(([trait, value]) => (
              <div key={trait}>
                <div className="flex justify-between text-xs text-[#6b7280] mb-1">
                  <span>{trait}</span>
                  <span>{value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a26]">
                  <div
                    className="h-full rounded-full bg-gradient-primary"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Memory */}
      {companion.memory && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-emerald-400" />
                Memory
              </CardTitle>
              <Link href={`/app/companions/${companion.id}/memory`}>
                <Button variant="ghost" size="sm" className="text-xs">
                  Edit Memory
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-[#6b7280]">
              Version {companion.memory.version} · Last updated {formatDate(companion.memory.updatedAt)}
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-[#4b5563]">
        Created {formatDate(companion.createdAt)}
      </p>
    </div>
  );
}
