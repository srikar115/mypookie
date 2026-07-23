import { NextRequest, NextResponse } from "next/server";
import { getCreditCost, getVideoCreditCost } from "@/lib/billing/pricingService";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "chat_message";
  const modelSlug = searchParams.get("model") ?? undefined;

  let cost: number;

  const videoMatch = action.match(/^video_generate_(\d+)s$/);
  if (videoMatch) {
    const seconds = parseInt(videoMatch[1]);
    cost = await getVideoCreditCost(seconds, modelSlug);
  } else {
    cost = await getCreditCost(action, modelSlug);
  }

  return NextResponse.json({ action, cost, modelSlug: modelSlug ?? null });
}
