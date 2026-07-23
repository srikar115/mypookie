import prisma from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserStatusToggle } from "@/components/admin/UserStatusToggle";
import { GrantCreditsForm } from "@/components/admin/GrantCreditsForm";
import { Users, Coins } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Users — Admin" };

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    include: { creditWallet: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f0ff] flex items-center gap-2">
          <Users className="h-6 w-6 text-purple-400" />
          Users
        </h1>
        <p className="text-sm text-[#6b7280] mt-0.5">{users.length} users total</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b border-[#1a1a26] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-white text-xs font-semibold">
                    {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#f1f0ff]">
                      {user.name ?? "No name"}
                    </p>
                    <p className="text-xs text-[#6b7280]">{user.email}</p>
                    <p className="text-xs text-[#4b5563]">
                      Joined {formatDate(user.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Credits */}
                  <div className="flex items-center gap-1.5 text-xs text-amber-300">
                    <Coins className="h-3.5 w-3.5" />
                    {(user.creditWallet?.balance ?? 0).toLocaleString()} credits
                  </div>

                  {/* Role */}
                  <Badge variant={user.role === "ADMIN" ? "warning" : "secondary"}>
                    {user.role.toLowerCase()}
                  </Badge>

                  {/* Status */}
                  <Badge variant={user.status === "ACTIVE" ? "success" : "destructive"}>
                    {user.status.toLowerCase()}
                  </Badge>

                  {/* Toggle status */}
                  <UserStatusToggle userId={user.id} currentStatus={user.status} />

                  {/* Grant credits */}
                  <GrantCreditsForm userId={user.id} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
