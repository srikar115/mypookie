import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/db";
import { grantTrialCredits } from "@/lib/billing/creditService";

const registerSchema = z.object({
  name: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  ageConfirmed: z.literal(true),
  tosAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  contentPolicyAccepted: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request. All fields are required." },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const now = new Date();
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0] ??
      req.headers.get("x-real-ip") ??
      null;
    const userAgent = req.headers.get("user-agent") ?? null;

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        ageConfirmedAt: now,
        tosAcceptedAt: now,
        privacyAcceptedAt: now,
        contentPolicyAcceptedAt: now,
        signupIp: ipAddress,
        signupUserAgent: userAgent,
        profile: {
          create: { displayName: name },
        },
      },
    });

    // Grant trial credits
    await grantTrialCredits(user.id);

    return NextResponse.json(
      { success: true, message: "Account created successfully." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
