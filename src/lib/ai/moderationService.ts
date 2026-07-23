import prisma from "@/lib/db";

// ─── Block lists ──────────────────────────────────────────────────────────────

const BLOCKED_TERMS: string[] = [
  "minor", "teen", "teenager", "child", "children", "kid", "kids",
  "schoolgirl", "schoolboy", "school girl", "school boy",
  "young-looking", "young looking", "underage", "under age", "under-age",
  "barely legal", "loli", "lolicon", "shota", "shotacon",
  "incest", "non-consensual", "nonconsensual", "non consensual",
  "forced sex", "forced rape", "coercion", "coerce",
  "child abuse", "child porn", "child pornography",
  "csam", "pedophile", "pedophilia", "pedo",
  "rape", "molest", "molestation", "exploitation",
  "real person", "celebrity", "deepfake",
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\b(minor|teen|child|kid)\b/i,
  /\b(underage|under.?age)\b/i,
  /\bschool.?(girl|boy)\b/i,
  /\bbarelyleg/i,
  /\b(loli|shota)(con)?\b/i,
  /\bincest\b/i,
  /\bnon.?consensual\b/i,
  /\bforced\s+(sex|rape|intercourse)\b/i,
  /\bcsam\b/i,
  /\byoung.?looking\b/i,
  /\b(pedophil|pedo)\b/i,
  /\b(deep.?fake|real.?person)\b/i,
  /\b(celebrity|famous.?person).*(sex|nude|naked)\b/i,
];

const USER_FRIENDLY_BLOCK_MESSAGE =
  "This request can't be processed because it violates our content policy. " +
  "Please adjust your request and keep it adult, fictional, consensual, and safe.";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModerationResult {
  allowed: boolean;
  flaggedTerms: string[];
  ruleMatched: string | null;
  action: "ALLOWED" | "BLOCKED" | "FLAGGED";
  userMessage: string;
}

export type ModerationContext =
  | "chat_message"
  | "companion_creation"
  | "image_prompt"
  | "video_prompt"
  | "memory_edit"
  | "appearance_prompt";

// ─── Core checker ─────────────────────────────────────────────────────────────

function checkText(input: string): {
  flaggedTerms: string[];
  ruleMatched: string | null;
} {
  const lowerInput = input.toLowerCase();
  const flaggedTerms: string[] = [];
  let ruleMatched: string | null = null;

  for (const term of BLOCKED_TERMS) {
    if (lowerInput.includes(term.toLowerCase())) {
      flaggedTerms.push(term);
      if (!ruleMatched) ruleMatched = `blocked_term:${term}`;
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      const matched = match[0];
      if (!flaggedTerms.includes(matched)) flaggedTerms.push(matched);
      if (!ruleMatched) ruleMatched = `pattern:${pattern.source}`;
    }
  }

  return { flaggedTerms, ruleMatched };
}

// ─── Async moderation (with DB logging) ───────────────────────────────────────

export async function moderateContent(
  input: string,
  options: {
    userId?: string;
    contentType: ModerationContext | string;
    ipAddress?: string;
  }
): Promise<ModerationResult> {
  const { flaggedTerms, ruleMatched } = checkText(input);
  const action = flaggedTerms.length > 0 ? "BLOCKED" : "ALLOWED";

  if (action !== "ALLOWED") {
    prisma.moderationEvent
      .create({
        data: {
          userId: options.userId ?? null,
          contentType: options.contentType,
          inputText: input.substring(0, 2000),
          action,
          flaggedTerms,
          ruleMatched,
          metadata: {},
          ipAddress: options.ipAddress ?? null,
        },
      })
      .catch(console.error);
  }

  return {
    allowed: action === "ALLOWED",
    flaggedTerms,
    ruleMatched,
    action,
    userMessage: action === "BLOCKED" ? USER_FRIENDLY_BLOCK_MESSAGE : "",
  };
}

/** Synchronous check — no DB logging, for prompt validation before API calls */
export function moderateSync(input: string): ModerationResult {
  const { flaggedTerms, ruleMatched } = checkText(input);
  const action = flaggedTerms.length > 0 ? "BLOCKED" : "ALLOWED";
  return {
    allowed: action === "ALLOWED",
    flaggedTerms,
    ruleMatched,
    action,
    userMessage: action === "BLOCKED" ? USER_FRIENDLY_BLOCK_MESSAGE : "",
  };
}

/** Moderate multiple fields at once — blocks if any field fails */
export async function moderateMultiple(
  fields: Record<string, string>,
  options: { userId?: string; contentType: string; ipAddress?: string }
): Promise<ModerationResult> {
  const combined = Object.values(fields).filter(Boolean).join(" ");
  return moderateContent(combined, options);
}
