import prisma from "@/lib/db";
import { ModelFormClient } from "../ModelFormClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Add Model" };

export default async function NewModelPage() {
  const providers = await prisma.aiProvider.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Add AI Model</h1>
        <p className="text-sm text-gray-400 mt-1">Configure a new AI model for chat, image, or video generation</p>
      </div>
      <ModelFormClient providers={providers.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))} />
    </div>
  );
}
