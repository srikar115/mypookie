import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageCircle, Cpu, Shield } from "lucide-react";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminDashboardPage() {
  const [userCount, companionCount, messageCount, moderationCount, modelCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.companion.count(),
      prisma.message.count(),
      prisma.moderationEvent.count({ where: { action: "BLOCKED" } }),
      prisma.aiModel.count({ where: { isEnabled: true } }),
    ]);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f0ff]">Admin Dashboard</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">Platform overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: userCount, icon: Users, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
          { label: "Companions", value: companionCount, icon: Cpu, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
          { label: "Total Messages", value: messageCount.toLocaleString(), icon: MessageCircle, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
          { label: "Moderation Blocks", value: moderationCount.toLocaleString(), icon: Shield, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg} border ${stat.border}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-[#f1f0ff]">{stat.value}</p>
                    <p className="text-xs text-[#6b7280]">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4 text-amber-400" />
            Active AI Models
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-[#f1f0ff]">{modelCount}</p>
          <p className="text-xs text-[#6b7280]">enabled models across all providers</p>
        </CardContent>
      </Card>
    </div>
  );
}
