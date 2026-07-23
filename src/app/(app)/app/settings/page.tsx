import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Mail, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: {
      name: true,
      email: true,
      createdAt: true,
      ageConfirmedAt: true,
      tosAcceptedAt: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-[#f1f0ff]">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-purple-400" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 py-3 border-b border-[#1a1a26]">
            <Mail className="h-4 w-4 text-[#6b7280]" />
            <div>
              <p className="text-xs text-[#6b7280]">Email</p>
              <p className="text-sm text-[#f1f0ff]">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-3 border-b border-[#1a1a26]">
            <User className="h-4 w-4 text-[#6b7280]" />
            <div>
              <p className="text-xs text-[#6b7280]">Display Name</p>
              <p className="text-sm text-[#f1f0ff]">{user.name ?? "Not set"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-3">
            <Calendar className="h-4 w-4 text-[#6b7280]" />
            <div>
              <p className="text-xs text-[#6b7280]">Member Since</p>
              <p className="text-sm text-[#f1f0ff]">{formatDate(user.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { label: "Age confirmed (18+)", date: user.ageConfirmedAt },
            { label: "Terms of Service accepted", date: user.tosAcceptedAt },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2 border-b border-[#1a1a26] last:border-0">
              <span className="text-[#c4c2d4]">{item.label}</span>
              <span className="text-xs text-[#6b7280]">
                {item.date ? formatDate(item.date) : "Not confirmed"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
