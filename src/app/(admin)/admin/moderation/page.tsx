import prisma from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Moderation — Admin" };

export default async function AdminModerationPage() {
  const events = await prisma.moderationEvent.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const blockedCount = events.filter((e) => e.action === "BLOCKED").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f0ff] flex items-center gap-2">
          <Shield className="h-6 w-6 text-red-400" />
          Moderation
        </h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          {events.length} events · {blockedCount} blocked
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Events", value: events.length, color: "text-[#f1f0ff]" },
          { label: "Blocked", value: blockedCount, color: "text-red-400" },
          { label: "Flagged", value: events.filter((e) => e.action === "FLAGGED").length, color: "text-amber-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-[#6b7280]">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[#6b7280] text-center py-6">No moderation events yet.</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-col gap-2 py-3 border-b border-[#1a1a26] last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={event.action === "BLOCKED" ? "destructive" : "warning"}>
                        {event.action}
                      </Badge>
                      <span className="text-xs text-[#6b7280]">{event.contentType}</span>
                    </div>
                    <span className="text-xs text-[#4b5563]">{formatDate(event.createdAt)}</span>
                  </div>
                  <p className="text-xs text-[#c4c2d4] font-mono bg-[#0c0c14] rounded px-3 py-2 truncate">
                    {event.inputText.substring(0, 200)}
                  </p>
                  {(event.flaggedTerms as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(event.flaggedTerms as string[]).map((term) => (
                        <span
                          key={term}
                          className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5"
                        >
                          {term}
                        </span>
                      ))}
                    </div>
                  )}
                  {event.user && (
                    <p className="text-xs text-[#4b5563]">
                      User: {event.user.email}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
