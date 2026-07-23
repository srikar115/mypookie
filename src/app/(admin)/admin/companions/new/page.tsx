import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanionAdminForm } from "../CompanionAdminForm";
import { ArrowLeft, UserPlus } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "New Companion — Admin" };

export default function NewCompanionPage() {
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
          <UserPlus className="h-6 w-6 text-purple-400" />
          New Public Companion
        </h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Create a template companion visible to all users on the browse tab.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Companion Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanionAdminForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
