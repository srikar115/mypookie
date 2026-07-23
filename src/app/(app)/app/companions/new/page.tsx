import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CompanionWizard } from "@/components/companions/CompanionWizard";

export const metadata = { title: "Create Companion" };

export default async function NewCompanionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[#f1f0ff] mb-2">
          Create Your Companion
        </h1>
        <p className="text-[#6b7280]">
          Design your perfect AI companion in a few easy steps.
        </p>
      </div>
      <CompanionWizard />
    </div>
  );
}
