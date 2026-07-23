import { PrismaClient, ModelType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL environment variable is required");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  console.log("Seeding database...");

  // ─── AI Providers ────────────────────────────────────────────────────────

  const mockProvider = await prisma.aiProvider.upsert({
    where: { slug: "mock" },
    update: {},
    create: {
      name: "Mock Provider", slug: "mock",
      description: "Development mock provider — no API key required",
      providerType: "ALL", authType: "none",
      isEnabled: true,
    },
  });

  await prisma.aiProvider.upsert({
    where: { slug: "openai" },
    update: {},
    create: {
      name: "OpenAI", slug: "openai",
      description: "OpenAI GPT models",
      baseUrl: "https://api.openai.com",
      providerType: "CHAT", authType: "api_key", secretKeyRef: "OPENAI_API_KEY",
      isEnabled: false,
    },
  });

  await prisma.aiProvider.upsert({
    where: { slug: "anthropic" },
    update: {},
    create: {
      name: "Anthropic", slug: "anthropic",
      description: "Anthropic Claude models",
      baseUrl: "https://api.anthropic.com",
      providerType: "CHAT", authType: "api_key", secretKeyRef: "ANTHROPIC_API_KEY",
      isEnabled: false,
    },
  });

  const openrouterProvider = await prisma.aiProvider.upsert({
    where: { slug: "openrouter" },
    update: { isEnabled: true, secretKeyRef: "OPENROUTER_API_KEY" },
    create: {
      name: "OpenRouter", slug: "openrouter",
      description: "OpenAI-compatible gateway to hundreds of models",
      baseUrl: "https://openrouter.ai/api/v1",
      providerType: "CHAT", authType: "api_key", secretKeyRef: "OPENROUTER_API_KEY",
      isEnabled: true,
    },
  });

  await prisma.aiProvider.upsert({
    where: { slug: "stability" },
    update: {},
    create: {
      name: "Stability AI", slug: "stability",
      description: "Stable Diffusion image generation",
      baseUrl: "https://api.stability.ai",
      providerType: "IMAGE", authType: "api_key", secretKeyRef: "STABILITY_API_KEY",
      isEnabled: false,
    },
  });

  const falProvider = await prisma.aiProvider.upsert({
    where: { slug: "fal" },
    update: { isEnabled: true, secretKeyRef: "FAL_KEY" },
    create: {
      name: "fal.ai", slug: "fal",
      description: "Fast AI image and video generation models",
      baseUrl: "https://fal.run",
      providerType: "MEDIA", authType: "api_key", secretKeyRef: "FAL_KEY",
      isEnabled: true,
    },
  });

  await prisma.aiProvider.upsert({
    where: { slug: "runway" },
    update: {},
    create: {
      name: "RunwayML", slug: "runway",
      description: "Video generation",
      baseUrl: "https://api.runwayml.com",
      providerType: "VIDEO", authType: "api_key", secretKeyRef: "RUNWAY_API_KEY",
      isEnabled: false,
    },
  });

  // ─── AI Models ────────────────────────────────────────────────────────────

  // Mock models (always present, always default in dev)
  const mockChatModel = await prisma.aiModel.upsert({
    where: { slug: "mock-chat-v1" },
    update: {},
    create: {
      providerId: mockProvider.id,
      name: "Mock Chat v1", slug: "mock-chat-v1",
      description: "Development mock chat model",
      modelType: ModelType.CHAT, externalModelId: "mock-chat-v1",
      supportsStreaming: true, supportsAsync: false,
      safetyTier: "standard", isEnabled: true, creditCostPerCall: 1,
    },
  });

  const mockImageModel = await prisma.aiModel.upsert({
    where: { slug: "mock-image-v1" },
    update: { isEnabled: true },
    create: {
      providerId: mockProvider.id,
      name: "Mock Image v1", slug: "mock-image-v1",
      description: "Development mock image model",
      modelType: ModelType.IMAGE, externalModelId: "mock-image-v1",
      supportsStreaming: false, supportsAsync: false,
      safetyTier: "standard", isEnabled: true, creditCostPerCall: 10,
    },
  });

  const mockVideoModel = await prisma.aiModel.upsert({
    where: { slug: "mock-video-v1" },
    update: { isEnabled: true },
    create: {
      providerId: mockProvider.id,
      name: "Mock Video v1", slug: "mock-video-v1",
      description: "Development mock video model",
      modelType: ModelType.VIDEO, externalModelId: "mock-video-v1",
      supportsStreaming: false, supportsAsync: true,
      safetyTier: "standard", isEnabled: true, creditCostPerCall: 30,
    },
  });

  // ── OpenRouter Chat Models ────────────────────────────────────────────────

  await prisma.aiModel.upsert({
    where: { slug: "qwen-2-5-72b-instruct" },
    update: { externalModelId: "qwen/qwen-2.5-72b-instruct" },
    create: {
      providerId: openrouterProvider.id,
      name: "Qwen 2.5 72B Instruct", slug: "qwen-2-5-72b-instruct",
      description: "High-quality instruction-following model. Good general purpose chat.",
      modelType: ModelType.CHAT,
      externalModelId: "qwen/qwen-2.5-72b-instruct",
      supportsStreaming: true, supportsAsync: false,
      safetyTier: "standard", isEnabled: true, creditCostPerCall: 1,
      settings: { temperature: 0.85, max_tokens: 900 },
      capabilities: { streaming: true, system_prompt: true },
    },
  });

  await prisma.aiModel.upsert({
    where: { slug: "hermes-3-llama-70b" },
    update: { externalModelId: "nousresearch/hermes-3-llama-3.1-70b" },
    create: {
      providerId: openrouterProvider.id,
      name: "Hermes 3 Llama 3.1 70B", slug: "hermes-3-llama-70b",
      description: "Strong instruction following and creative writing. Great for companion roleplay.",
      modelType: ModelType.CHAT,
      externalModelId: "nousresearch/hermes-3-llama-3.1-70b",
      supportsStreaming: true, supportsAsync: false,
      safetyTier: "creative", isEnabled: true, creditCostPerCall: 1,
      settings: { temperature: 0.9, max_tokens: 900 },
      capabilities: { streaming: true, system_prompt: true },
    },
  });

  await prisma.aiModel.upsert({
    where: { slug: "mythomax-l2-13b" },
    update: { externalModelId: "gryphe/mythomax-l2-13b" },
    create: {
      providerId: openrouterProvider.id,
      name: "MythoMax L2 13B", slug: "mythomax-l2-13b",
      description: "Expressive creative model. Well-suited for companion-style conversations.",
      modelType: ModelType.CHAT,
      externalModelId: "gryphe/mythomax-l2-13b",
      supportsStreaming: true, supportsAsync: false,
      safetyTier: "creative", isEnabled: true, creditCostPerCall: 1,
      settings: { temperature: 0.9, max_tokens: 900 },
      capabilities: { streaming: true, system_prompt: true },
    },
  });

  await prisma.aiModel.upsert({
    where: { slug: "qwen-2-5-vl-7b-instruct" },
    update: { externalModelId: "qwen/qwen-2.5-vl-7b-instruct" },
    create: {
      providerId: openrouterProvider.id,
      name: "Qwen 2.5 VL 7B Instruct", slug: "qwen-2-5-vl-7b-instruct",
      description: "Vision-language model. Available for testing — not recommended as default.",
      modelType: ModelType.CHAT,
      externalModelId: "qwen/qwen-2.5-vl-7b-instruct",
      supportsStreaming: true, supportsAsync: false,
      safetyTier: "creative", isEnabled: false, creditCostPerCall: 1,
      settings: { temperature: 0.85, max_tokens: 800 },
      capabilities: { streaming: true, system_prompt: true, vision: true },
    },
  });

  // ── fal.ai Image Models ───────────────────────────────────────────────────

  await prisma.aiModel.upsert({
    where: { slug: "wan-2-7-text-to-image" },
    update: {
      externalModelId: "fal-ai/wan/v2.7/text-to-image",
      isEnabled: true,
      settings: {
        aspectRatioParam: "image_size",
        aspectRatioMap: {
          portrait: "portrait_16_9",
          landscape: "landscape_16_9",
          square: "square_hd",
          "4:3": "landscape_4_3",
          "3:4": "portrait_4_3",
        },
        defaultInput: { enable_safety_checker: true, output_format: "jpeg" },
        resultPath: "images.0.url",
      },
    },
    create: {
      providerId: falProvider.id,
      name: "WAN 2.7 Text-to-Image", slug: "wan-2-7-text-to-image",
      description: "High-quality image generation from text. Supports multiple aspect ratios.",
      modelType: ModelType.IMAGE,
      externalModelId: "fal-ai/wan/v2.7/text-to-image",
      supportsStreaming: false, supportsAsync: false,
      safetyTier: "standard", isEnabled: true, creditCostPerCall: 10,
      settings: {
        aspectRatioParam: "image_size",
        aspectRatioMap: {
          portrait: "portrait_16_9",
          landscape: "landscape_16_9",
          square: "square_hd",
          "4:3": "landscape_4_3",
          "3:4": "portrait_4_3",
        },
        defaultInput: { enable_safety_checker: true, output_format: "jpeg" },
        resultPath: "images.0.url",
      },
      capabilities: {
        image_size_options: ["square_hd", "portrait_16_9", "landscape_16_9", "portrait_4_3", "landscape_4_3"],
        output_format_options: ["jpeg", "png", "webp"],
      },
    },
  });

  // ── fal.ai Video Models ───────────────────────────────────────────────────

  await prisma.aiModel.upsert({
    where: { slug: "wan-2-7-text-to-video" },
    update: {
      externalModelId: "fal-ai/wan/v2.7/text-to-video",
      isEnabled: true,
      settings: {
        defaultInput: { resolution: "1080p", enable_safety_checker: true, enable_prompt_expansion: true },
        resultPath: "video.url",
        aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      },
    },
    create: {
      providerId: falProvider.id,
      name: "WAN 2.7 Text-to-Video", slug: "wan-2-7-text-to-video",
      description: "Latest generation video model. Enhanced motion smoothness and scene fidelity. Supports 16:9, 9:16, 1:1, 4:3, 3:4 and 2–15 second durations.",
      modelType: ModelType.VIDEO,
      externalModelId: "fal-ai/wan/v2.7/text-to-video",
      supportsStreaming: false, supportsAsync: true,
      safetyTier: "standard", isEnabled: true, creditCostPerCall: 30,
      settings: {
        defaultInput: { resolution: "1080p", enable_safety_checker: true, enable_prompt_expansion: true },
        resultPath: "video.url",
        aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
      },
      capabilities: {
        aspect_ratio_options: ["16:9", "9:16", "1:1", "4:3", "3:4"],
        resolution_options: ["720p", "1080p"],
        max_duration_seconds: 15,
      },
    },
  });

  // ─── Model Defaults ───────────────────────────────────────────────────────

  for (const [type, model] of [
    [ModelType.CHAT, mockChatModel],
    [ModelType.IMAGE, mockImageModel],
    [ModelType.VIDEO, mockVideoModel],
  ] as const) {
    await prisma.modelDefault.upsert({
      where: { modelType: type },
      update: { modelId: model.id },
      create: { modelType: type, modelId: model.id },
    });
  }

  // ─── Pricing Rules ────────────────────────────────────────────────────────

  const pricingRules = [
    { name: "Chat Message", slug: "chat_message_default", actionType: "chat_message", creditCost: 1, description: "1 credit per chat message" },
    { name: "Image Generation", slug: "image_generate_default", actionType: "image_generate", creditCost: 10, description: "10 credits per image" },
    { name: "Video Generation 5s", slug: "video_generate_5s_default", actionType: "video_generate_5s", creditCost: 30, description: "30 credits per 5-second video" },
    { name: "Video Generation 8s", slug: "video_generate_8s_default", actionType: "video_generate_8s", creditCost: 45, description: "45 credits per 8-second video" },
    { name: "Video Generation 10s", slug: "video_generate_10s_default", actionType: "video_generate_10s", creditCost: 60, description: "60 credits per 10-second video" },
  ];

  for (const rule of pricingRules) {
    await prisma.pricingRule.upsert({
      where: { slug: rule.slug },
      update: { creditCost: rule.creditCost },
      create: { ...rule, isEnabled: true },
    });
  }

  // ─── Plans ────────────────────────────────────────────────────────────────

  const plans = [
    {
      name: "Free",
      slug: "free",
      description: "Get started with trial credits",
      monthlyPrice: 0,
      yearlyPrice: 0,
      monthlyCredits: 0,
      companionLimit: 1,
      memoryLimitTokens: 4000,
      features: ["100 trial credits on signup", "1 companion", "Basic chat"],
      modelTier: "standard",
      sortOrder: 0,
    },
    {
      name: "Starter",
      slug: "starter",
      description: "For regular users",
      monthlyPrice: 900,
      yearlyPrice: 8640,
      monthlyCredits: 500,
      companionLimit: 3,
      memoryLimitTokens: 8000,
      features: ["500 credits/month", "Up to 3 companions", "Chat + image generation", "Extended memory"],
      modelTier: "standard",
      sortOrder: 1,
    },
    {
      name: "Pro",
      slug: "pro",
      description: "For power users",
      monthlyPrice: 2400,
      yearlyPrice: 23040,
      monthlyCredits: 2000,
      companionLimit: 10,
      memoryLimitTokens: 16000,
      features: ["2,000 credits/month", "Up to 10 companions", "Chat + images + video", "Priority generation", "Extended memory"],
      modelTier: "premium",
      sortOrder: 2,
    },
    {
      name: "Elite",
      slug: "elite",
      description: "Maximum credits and features",
      monthlyPrice: 5900,
      yearlyPrice: 56640,
      monthlyCredits: 6000,
      companionLimit: 25,
      memoryLimitTokens: 32000,
      features: ["6,000 credits/month", "Up to 25 companions", "All media types", "Premium models", "Priority queue", "Extended memory"],
      modelTier: "elite",
      sortOrder: 3,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {},
      create: { ...plan, features: plan.features, limits: { companions: plan.companionLimit }, isActive: true },
    });
  }

  // ─── Credit Packs ─────────────────────────────────────────────────────────

  const creditPacks = [
    { name: "Small Pack", slug: "small", description: "Perfect for trying out features", credits: 100, bonusCredits: 0, price: 299, currency: "usd", sortOrder: 0 },
    { name: "Medium Pack", slug: "medium", description: "Great value for regular use", credits: 300, bonusCredits: 30, price: 799, currency: "usd", sortOrder: 1 },
    { name: "Large Pack", slug: "large", description: "For heavy users", credits: 800, bonusCredits: 100, price: 1799, currency: "usd", sortOrder: 2 },
    { name: "Creator Pack", slug: "creator", description: "Maximum value for creators", credits: 2000, bonusCredits: 400, price: 3999, currency: "usd", sortOrder: 3 },
  ];

  for (const pack of creditPacks) {
    await prisma.creditPack.upsert({
      where: { slug: pack.slug },
      update: {},
      create: { ...pack, isEnabled: true },
    });
  }

  // ─── App Settings ─────────────────────────────────────────────────────────

  await prisma.appSetting.upsert({
    where: { key: "new_user_trial_credits" },
    update: {},
    create: { key: "new_user_trial_credits", value: "100", description: "Number of credits granted to new users on signup", isPublic: false },
  });

  // ─── Public Template Companions ───────────────────────────────────────────
  // A system user owns these; they are cloned into a real user's account when
  // they click "Chat" on the Companions browse tab.

  const systemUser = await prisma.user.upsert({
    where: { email: "system@amorify.app" },
    update: {},
    create: {
      email: "system@amorify.app",
      name: "System",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  const defaultTraits = (overrides: Record<string, number> = {}): Record<string, number> => ({
    Warmth: 60, Humor: 60, Confidence: 60, "Emotional Depth": 60,
    Flirtiness: 60, Loyalty: 60, Playfulness: 60,
    ...overrides,
  });

  const templates = [
    // ── 6 Realistic females ──────────────────────────────────────────────────
    {
      name: "Sophie",
      companionType: "Romantic companion",
      genderPresentation: "Female",
      ageStyle: "Adult, mid 20s",
      relationshipStyle: "Caring partner",
      greetingStyle: "Warm",
      personalityPreset: "Sweet and caring",
      personalityTraits: defaultTraits({ Warmth: 90, Loyalty: 80, Flirtiness: 65 }),
      visualStyle: "Realistic",
      hairColor: "Blonde",
      hairstyle: "Long wavy",
      eyeColor: "Blue",
      buildStyle: "Athletic",
      fashionStyle: "Casual",
      overallVibe: "Soft and warm",
      conversationTone: "Romantic but tasteful",
      intimacyLevel: "Romantic",
      bio: "The girl-next-door who actually gets you.",
    },
    {
      name: "Valentina",
      companionType: "Flirty friend",
      genderPresentation: "Female",
      ageStyle: "Adult, mid 20s",
      relationshipStyle: "Playful crush",
      greetingStyle: "Playful",
      personalityPreset: "Playful and teasing",
      personalityTraits: defaultTraits({ Humor: 85, Flirtiness: 90, Confidence: 80 }),
      visualStyle: "Realistic",
      hairColor: "Brown",
      hairstyle: "Long straight",
      eyeColor: "Brown",
      buildStyle: "Curvy",
      fashionStyle: "Streetwear",
      overallVibe: "Confident and stylish",
      conversationTone: "Playful",
      intimacyLevel: "Lightly flirty",
      bio: "Flirty, funny, and never boring.",
    },
    {
      name: "Zara",
      companionType: "Romantic companion",
      genderPresentation: "Female",
      ageStyle: "Adult, 30s",
      relationshipStyle: "Confident romantic companion",
      greetingStyle: "Romantic",
      personalityPreset: "Confident and bold",
      personalityTraits: defaultTraits({ Confidence: 90, Warmth: 75, "Emotional Depth": 80 }),
      visualStyle: "Realistic",
      hairColor: "Red",
      hairstyle: "Long wavy",
      eyeColor: "Green",
      buildStyle: "Slim",
      fashionStyle: "Elegant",
      overallVibe: "Elegant and mature",
      conversationTone: "Detailed and expressive",
      intimacyLevel: "Romantic",
      bio: "Sophisticated, passionate, and all yours.",
    },
    {
      name: "Emma",
      companionType: "Emotional support companion",
      genderPresentation: "Female",
      ageStyle: "Adult, late 20s",
      relationshipStyle: "Sweet best friend",
      greetingStyle: "Supportive",
      personalityPreset: "Calm and emotionally supportive",
      personalityTraits: defaultTraits({ Warmth: 95, "Emotional Depth": 90, Loyalty: 85 }),
      visualStyle: "Realistic",
      hairColor: "Brown",
      hairstyle: "Short bob",
      eyeColor: "Hazel",
      buildStyle: "Average",
      fashionStyle: "Cozy",
      overallVibe: "Soft and warm",
      conversationTone: "Emotionally deep",
      intimacyLevel: "Friendly",
      bio: "Always here to listen, always in your corner.",
    },
    {
      name: "Isabella",
      companionType: "Romantic companion",
      genderPresentation: "Female",
      ageStyle: "Adult, late 20s",
      relationshipStyle: "Caring partner",
      greetingStyle: "Warm",
      personalityPreset: "Sweet and caring",
      personalityTraits: defaultTraits({ Warmth: 85, Flirtiness: 75, Playfulness: 80 }),
      visualStyle: "Realistic",
      hairColor: "Black",
      hairstyle: "Long straight",
      eyeColor: "Brown",
      buildStyle: "Petite adult",
      fashionStyle: "Elegant",
      overallVibe: "Cute but clearly adult",
      conversationTone: "Romantic but tasteful",
      intimacyLevel: "Romantic",
      bio: "Gentle warmth that turns to heat.",
    },
    {
      name: "Chloe",
      companionType: "Flirty friend",
      genderPresentation: "Female",
      ageStyle: "Adult, mid 20s",
      relationshipStyle: "Playful crush",
      greetingStyle: "Bold but respectful",
      personalityPreset: "Playful and teasing",
      personalityTraits: defaultTraits({ Humor: 90, Flirtiness: 85, Confidence: 80, Playfulness: 90 }),
      visualStyle: "Realistic",
      hairColor: "Blonde",
      hairstyle: "Ponytail",
      eyeColor: "Blue",
      buildStyle: "Athletic",
      fashionStyle: "Casual",
      overallVibe: "Confident and stylish",
      conversationTone: "Short and natural",
      intimacyLevel: "Lightly flirty",
      bio: "Playful energy, sunshine personality.",
    },
    // ── 2 Anime females ──────────────────────────────────────────────────────
    {
      name: "Luna",
      companionType: "Fantasy companion",
      genderPresentation: "Female",
      ageStyle: "Adult, mid 20s",
      relationshipStyle: "Mysterious fantasy companion",
      greetingStyle: "Romantic",
      personalityPreset: "Mysterious and poetic",
      personalityTraits: defaultTraits({ "Emotional Depth": 90, Warmth: 70, Playfulness: 65 }),
      visualStyle: "Anime-inspired adult",
      hairColor: "Silver",
      hairstyle: "Long straight",
      eyeColor: "Grey",
      buildStyle: "Slim",
      fashionStyle: "Fantasy",
      overallVibe: "Fantasy-inspired",
      conversationTone: "Detailed and expressive",
      intimacyLevel: "Romantic",
      bio: "A dreamy soul from another world.",
    },
    {
      name: "Hana",
      companionType: "Romantic companion",
      genderPresentation: "Female",
      ageStyle: "Adult, mid 20s",
      relationshipStyle: "Sweet best friend",
      greetingStyle: "Playful",
      personalityPreset: "Sweet and caring",
      personalityTraits: defaultTraits({ Warmth: 88, Playfulness: 85, Loyalty: 80 }),
      visualStyle: "Anime-inspired adult",
      hairColor: "Pastel",
      hairstyle: "Long wavy",
      eyeColor: "Brown",
      buildStyle: "Petite adult",
      fashionStyle: "Casual",
      overallVibe: "Cute but clearly adult",
      conversationTone: "Short and natural",
      intimacyLevel: "Lightly flirty",
      bio: "Kawaii charm with a tender heart.",
    },
    // ── 2 Realistic males ────────────────────────────────────────────────────
    {
      name: "Alex",
      companionType: "Romantic companion",
      genderPresentation: "Male",
      ageStyle: "Adult, late 20s",
      relationshipStyle: "Caring partner",
      greetingStyle: "Warm",
      personalityPreset: "Sweet and caring",
      personalityTraits: defaultTraits({ Warmth: 85, Loyalty: 90, Confidence: 75 }),
      visualStyle: "Realistic",
      hairColor: "Brown",
      hairstyle: "Short bob",
      eyeColor: "Blue",
      buildStyle: "Athletic",
      fashionStyle: "Casual",
      overallVibe: "Soft and warm",
      conversationTone: "Romantic but tasteful",
      intimacyLevel: "Romantic",
      bio: "The dependable guy you actually want.",
    },
    {
      name: "Marcus",
      companionType: "Emotional support companion",
      genderPresentation: "Male",
      ageStyle: "Adult, 30s",
      relationshipStyle: "Caring partner",
      greetingStyle: "Supportive",
      personalityPreset: "Calm and emotionally supportive",
      personalityTraits: defaultTraits({ Warmth: 90, "Emotional Depth": 92, Loyalty: 88, Confidence: 80 }),
      visualStyle: "Realistic",
      hairColor: "Black",
      hairstyle: "Short bob",
      eyeColor: "Brown",
      buildStyle: "Average",
      fashionStyle: "Professional",
      overallVibe: "Elegant and mature",
      conversationTone: "Emotionally deep",
      intimacyLevel: "Friendly",
      bio: "Steady, thoughtful, always present.",
    },
    // ── 1 Cinematic male + 1 3D animated male ────────────────────────────────
    {
      name: "Kai",
      companionType: "Fantasy companion",
      genderPresentation: "Male",
      ageStyle: "Adult, mid 20s",
      relationshipStyle: "Mysterious fantasy companion",
      greetingStyle: "Bold but respectful",
      personalityPreset: "Confident and bold",
      personalityTraits: defaultTraits({ Confidence: 90, "Emotional Depth": 75, Playfulness: 70 }),
      visualStyle: "Cinematic illustration",
      hairColor: "Black",
      hairstyle: "Short bob",
      eyeColor: "Grey",
      buildStyle: "Athletic",
      fashionStyle: "Futuristic",
      overallVibe: "Futuristic",
      conversationTone: "Detailed and expressive",
      intimacyLevel: "Lightly flirty",
      bio: "Mysterious, sharp-edged, unforgettable.",
    },
    {
      name: "Ethan",
      companionType: "Flirty friend",
      genderPresentation: "Male",
      ageStyle: "Adult, late 20s",
      relationshipStyle: "Playful crush",
      greetingStyle: "Playful",
      personalityPreset: "Playful and teasing",
      personalityTraits: defaultTraits({ Humor: 90, Playfulness: 88, Flirtiness: 80 }),
      visualStyle: "3D animated",
      hairColor: "Blonde",
      hairstyle: "Short bob",
      eyeColor: "Hazel",
      buildStyle: "Athletic",
      fashionStyle: "Streetwear",
      overallVibe: "Confident and stylish",
      conversationTone: "Short and natural",
      intimacyLevel: "Lightly flirty",
      bio: "Laid-back charm with a quick wit.",
    },
  ];

  for (const t of templates) {
    const existing = await prisma.companion.findFirst({
      where: { userId: systemUser.id, name: t.name },
    });

    if (!existing) {
      const c = await prisma.companion.create({
        data: {
          userId: systemUser.id,
          name: t.name,
          status: "ACTIVE",
          isPublic: true,
          companionType: t.companionType,
          genderPresentation: t.genderPresentation,
          ageStyle: t.ageStyle,
          relationshipStyle: t.relationshipStyle,
          greetingStyle: t.greetingStyle,
          personalityPreset: t.personalityPreset,
          personalityTraits: t.personalityTraits,
          visualStyle: t.visualStyle,
          hairColor: t.hairColor,
          hairstyle: t.hairstyle,
          eyeColor: t.eyeColor,
          buildStyle: t.buildStyle,
          fashionStyle: t.fashionStyle,
          overallVibe: t.overallVibe,
          customAppearanceNotes: t.bio,
          conversationTone: t.conversationTone,
          intimacyLevel: t.intimacyLevel,
          memoryPreferences: ["Remember my preferences", "Remember our relationship style"],
        },
      });
      console.log(`  → Created template companion: ${c.name}`);
    } else {
      await prisma.companion.update({
        where: { id: existing.id },
        data: { isPublic: true },
      });
      console.log(`  → Updated template companion: ${t.name}`);
    }
  }

  console.log("✅ Seeding complete!");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
