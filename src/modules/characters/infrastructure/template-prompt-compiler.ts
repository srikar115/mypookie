import type { CompiledPrompts } from "../domain/entities/character";
import type {
  PromptCompiler,
  PromptCompilerInput,
} from "../application/ports/prompt-compiler";

/**
 * Default wardrobe pools per base-style + gender.
 *
 * Rationale: base text-to-image models default toward whatever their training
 * data prior nudges toward when no clothing token is present. For "full body
 * shot" prompts at this parameter tier that often means nude output. Emitting
 * an explicit clothing token every time — chosen deterministically from a
 * curated pool — keeps first-generation results consistent, clothed, and
 * varied across characters without asking the wizard user for clothing input.
 *
 * Users who fill in the wizard's clothing field always override the default.
 */
const CLOTHING_POOLS: Record<string, Record<string, readonly string[]>> = {
  REALISTIC: {
    FEMALE: [
      // Casual streetwear
      "a fitted white t-shirt and high-waisted blue jeans",
      "a cropped denim jacket over a graphic band tee and mom jeans",
      "an oversized flannel shirt tied at the waist and boyfriend jeans",
      "a pastel hoodie and biker shorts with white sneakers",
      "a striped long-sleeve top and wide-leg jeans",
      // Elegant / formal
      "an elegant little black cocktail dress with strappy heels",
      "a satin slip dress in emerald green with delicate jewelry",
      "a cream silk blouse tucked into a pleated midi skirt",
      "a chic silk camisole and wide-leg trousers",
      "a champagne-colored gown with an open back",
      // Urban / streetwear
      "an oversized bomber jacket, crop top, and cargo pants with chunky sneakers",
      "a graphic hoodie tucked into a pleated tennis skirt",
      "a puffer jacket, ribbed tank, and baggy skater jeans",
      "a mesh long-sleeve top, distressed denim mini skirt, and combat boots",
      "a fitted crop top, high-waisted parachute pants, and platform sneakers",
      // Athletic / sporty
      "a matching athletic set with sports bra and high-waisted leggings",
      "a fitted tank top and running shorts with sneakers",
      "a cropped hoodie, biker shorts, and colorful running shoes",
      "a tennis skirt, polo top, and clean white sneakers",
      "yoga leggings and a soft racerback tank",
      // Beach / swimwear
      "a coral triangle bikini with a sheer sarong",
      "a black high-waisted bikini and a wide-brim sun hat",
      "a tropical print one-piece swimsuit with sunglasses",
      "a white crochet bikini with beach shorts",
      "a striped tankini set with denim shorts over it",
      // Pub / nightlife
      "a fitted black bodycon dress and knee-high boots",
      "a satin camisole tucked into leather pants",
      "a metallic sequin mini dress with strappy heels",
      "a lace corset top and high-waisted leather skirt",
      "a plunging silk blouse and wide-leg tuxedo pants",
      // Student / academic
      "a preppy sweater vest over a collared shirt and a pleated plaid skirt",
      "an oversized college sweatshirt and cuffed jeans",
      "a cardigan, button-up shirt, and mid-thigh pleated skirt with knee-high socks",
      "a varsity jacket over a graphic tee and denim shorts",
      "denim overalls over a striped long-sleeve tee",
      // Musician / performer
      "a vintage band t-shirt, ripped skinny jeans, and a leather jacket",
      "a fringe suede jacket, cropped tank, and flare jeans",
      "a satin corset top, high-waisted leather pants, and platform boots",
      "an oversized concert tee dress with fishnets and combat boots",
      "a metallic performance jumpsuit with statement earrings",
      // Business / professional
      "a tailored blazer, silk shirt, and pencil skirt with pumps",
      "a fitted power suit in navy with a satin shell top",
      "a collared shirt tucked into wide-leg trousers with loafers",
      "a shift dress under a structured blazer",
      // Cozy / loungewear
      "a chunky knit oversized sweater and slim leggings",
      "a soft cashmere cardigan over a cotton camisole and joggers",
      "a fitted turtleneck sweater and tailored wool trousers",
      "matching satin pajama-style set with slippers",
      // Bohemian / vintage
      "a flowing bohemian maxi dress with floral print and layered necklaces",
      "vintage 70s bell-bottom jeans and a peasant blouse",
      "a retro polka-dot swing dress with a red belt",
      "a crochet crop top and high-waisted denim shorts",
      "a linen sundress with woven sandals and a straw hat",
      // Edgy / punk
      "a leather biker jacket, ripped fishnet tights, and a mini skirt",
      "a studded belt, cropped band tee, and combat boots with a plaid skirt",
    ],
    MALE: [
      // Casual streetwear
      "a plain grey crewneck t-shirt and dark denim jeans",
      "a fitted white tee tucked into slim chinos with white sneakers",
      "an oversized hoodie and joggers with sneakers",
      "a flannel shirt open over a graphic tee and jeans",
      "a striped long-sleeve top and khaki pants",
      // Elegant / formal
      "a slim-cut black tuxedo with a bow tie",
      "a charcoal three-piece suit with a silk pocket square",
      "a navy blazer, crisp white shirt, and tailored trousers",
      "a burgundy velvet blazer over a black turtleneck",
      // Urban / streetwear
      "an oversized bomber jacket, graphic hoodie, and cargo pants",
      "a puffer vest over a hoodie with baggy skater jeans and high-tops",
      "a techwear jacket with utility pants and chunky sneakers",
      "a varsity jacket over a plain tee and slim jeans",
      // Athletic / sporty
      "a fitted athletic tank and gym shorts with running shoes",
      "a moisture-wicking training tee and joggers",
      "a technical running jacket and compression tights",
      // Beach / swimwear
      "board shorts and an open linen shirt at the beach",
      "swim trunks with a casual tank and flip-flops",
      "a fitted swim shirt and swim shorts",
      // Pub / nightlife
      "a fitted black turtleneck and tailored slacks with dress boots",
      "a slim leather jacket over a graphic tee and dark jeans",
      "a bomber jacket, dark shirt, and slim chinos",
      // Student / academic
      "a college hoodie and jeans with a backpack slung over one shoulder",
      "a preppy sweater over a collared shirt with khaki chinos",
      "a varsity letter jacket, plain tee, and jeans",
      // Musician / performer
      "a vintage rock band t-shirt, black skinny jeans, and a leather jacket",
      "a distressed denim vest over a graphic tee and ripped jeans",
      "a silk shirt half-unbuttoned with leather pants and rings",
      "an oversized flannel and beanie with cargo pants",
      // Business / professional
      "a well-tailored suit with a crisp shirt and silk tie",
      "a crisp button-up rolled to the elbows with slim slacks",
      // Cozy / loungewear
      "an oversized cable-knit sweater and dark jeans",
      "a soft henley shirt and joggers",
      "a linen button-up shirt and shorts",
    ],
    NONBINARY: [
      // Casual
      "an oversized cream sweater and dark denim jeans",
      "a plain tee tucked into wide-leg trousers with loafers",
      "a hoodie and cuffed cargo pants",
      "an oversized button-up shirt open over a plain tank and jeans",
      // Elegant
      "a satin blazer, silk shirt, and wide-leg tailored trousers",
      "an unstructured suit in a soft neutral tone",
      // Urban
      "a techwear jacket and utility cargo pants with chunky sneakers",
      "a bomber jacket, graphic hoodie, and skater jeans",
      // Athletic / cozy
      "a chunky knit sweater and joggers",
      "a training set of matching top and pants",
      // Beach / summer
      "a linen open shirt and swim trunks",
      "a flowing kaftan and swimwear underneath",
      // Musician / edgy
      "a leather jacket, band tee, and ripped jeans",
      "a satin shirt, layered chains, and tailored pants",
    ],
  },
  ANIME: {
    FEMALE: [
      // School / classic anime
      "a chic school-style blazer, white blouse, and pleated plaid skirt",
      "a sailor school uniform with a ribbon tie and knee-high socks",
      "a preppy cardigan over a collared shirt and pleated skirt",
      // Streetwear / kawaii
      "a pastel oversized hoodie and pleated tennis skirt",
      "a kawaii pink cropped hoodie with a heart print and mini skirt",
      "an oversized graphic tee, thigh-high socks, and platform sneakers",
      "a cropped bomber jacket over a striped tee and denim shorts",
      // Kimono / traditional
      "an elegant floral kimono with an obi sash",
      "a summer yukata with a fan pattern and geta sandals",
      "a modern hakama outfit with a haori jacket",
      // Cyberpunk / futuristic
      "a cyberpunk techwear jacket with LED trim and fitted leggings",
      "a futuristic bodysuit with a cropped utility vest and combat boots",
      "a holographic mini dress with knee-high boots and a chest harness",
      // Idol / performer
      "a colorful magical girl idol outfit with a frilly skirt and ribbons",
      "a metallic idol stage costume with layered frills",
      "a lolita-style dress with a lace bib and mary jane shoes",
      // Fantasy / cosplay
      "a witch-inspired dress with a wide-brim hat and layered ruffles",
      "a fantasy warrior outfit with a fitted top and a flowing skirt",
      "an elven ranger tunic with cross-body straps and leather boots",
      "a maid-style dress with a lace apron and headband",
      // Beach / summer
      "a triangle bikini with a beach cover-up",
      "a colorful one-piece swimsuit with a sarong",
      "a striped tankini and denim shorts",
      // Pub / nightlife (still anime)
      "a chic black party dress with sheer sleeves",
      "a leather mini skirt with a cropped top and knee-high boots",
      // Musician
      "a rockstar outfit with a band tee, ripped tights, and a mini skirt",
      "a punk-inspired outfit with a spiked collar, cropped top, and plaid skirt",
      // Cozy
      "a giant cozy sweater dress with over-the-knee socks",
    ],
    MALE: [
      // School / classic
      "a modern school-style blazer, white shirt, and dark trousers",
      "a gakuran high-collar school uniform in dark navy",
      // Streetwear
      "an anime streetwear hoodie and slim cargo pants",
      "an oversized bomber jacket, graphic tee, and joggers",
      "a distressed denim jacket and skinny jeans with sneakers",
      // Kimono / traditional
      "a traditional dark kimono with a wide obi",
      "a hakama outfit in slate blue with a haori",
      // Cyberpunk
      "a cyberpunk trench coat with utility straps and cargo pants",
      "a futuristic bomber jacket with LED accents and slim tech pants",
      // Fantasy / cosplay
      "a fantasy swordsman outfit with a tunic, belted cloak, and boots",
      "an anime demon prince outfit with layered black robes",
      // Musician / performer
      "a rockstar outfit with a leather jacket, band tee, and ripped jeans",
      "a stylish idol stage costume with a fitted white jacket",
      // Beach
      "swim trunks and an open linen shirt at the beach",
      // Pub / nightlife
      "a fitted black turtleneck and dark tailored trousers",
      // Cozy
      "an oversized knit sweater, scarf, and slim jeans",
    ],
    NONBINARY: [
      "a casual anime hoodie and jeans with sneakers",
      "a streetwear jacket over a graphic tee and cargo pants",
      "a cyberpunk techwear outfit with utility straps",
      "a traditional yukata with a subtle geometric pattern",
      "a chic minimalist blazer and wide-leg trousers",
      "a fantasy adventurer outfit with a cape and leather boots",
      "a rockstar band tee and leather jacket with ripped jeans",
      "a cozy oversized sweater and knee-length skirt",
    ],
  },
  THREE_D: {
    FEMALE: [
      "a modern fitted little black dress with heels",
      "a chic athleisure set with a cropped hoodie and matching leggings",
      "a stylized fantasy warrior outfit with a fitted top and skirt",
      "a cyberpunk techwear jumpsuit with utility harness",
      "a summer bikini with a beach sarong",
      "a preppy school uniform with a blazer and pleated skirt",
      "a rockstar outfit with a leather jacket and mini skirt",
      "an elegant evening gown with a plunging neckline",
      "a cozy oversized sweater and slim jeans",
    ],
    MALE: [
      "a sharp modern suit with a slim tie",
      "a stylized fantasy warrior armor with a cape",
      "a cyberpunk techwear jacket and cargo pants",
      "swim trunks and an open shirt at the beach",
      "a leather biker jacket, tee, and ripped jeans",
      "a college hoodie and joggers",
      "a fitted black turtleneck and dark trousers",
    ],
    NONBINARY: [
      "a stylish minimalist blazer and tailored trousers",
      "a cyberpunk techwear jumpsuit",
      "a cozy oversized sweater and jeans",
      "a fantasy adventurer outfit with a cloak",
      "an athletic training set",
    ],
  },
  CARTOON: {
    FEMALE: [
      "a colorful graphic tee tucked into a pleated skirt with sneakers",
      "a playful sundress with bold patterns and sandals",
      "a stylized superhero outfit with a fitted top and cape",
      "a cozy patterned sweater and jeans",
      "a beach outfit with a cute one-piece swimsuit and floppy hat",
      "a school-style outfit with a cardigan and skirt",
      "a rockstar outfit with a band tee and mini skirt",
      "a fantasy adventurer outfit with a tunic and belt",
    ],
    MALE: [
      "a colorful graphic tee and cargo shorts with sneakers",
      "a superhero-style fitted outfit with a bold color scheme",
      "a casual hoodie and jeans",
      "a fantasy adventurer tunic with a leather belt",
      "beach shorts and an unbuttoned shirt",
    ],
    NONBINARY: [
      "a colorful patterned hoodie and cargo pants",
      "a superhero-inspired outfit with bold colors",
      "a fantasy adventurer cloak and tunic",
      "a cozy oversized sweater and jeans",
    ],
  },
};

/**
 * Deterministic hash → integer. Same input always maps to the same pool
 * index, so a given character keeps the same default outfit across all
 * regenerations (regens replay the stored appearancePrompt verbatim).
 */
function pickFromPool<T>(pool: readonly T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % pool.length;
  return pool[idx];
}

/**
 * TemplatePromptCompiler — deterministic string composition of the three
 * artifacts every character carries:
 *
 *   1. systemPrompt     → primes the LLM for chat sessions
 *   2. appearancePrompt → drives Fal Z-Image Turbo character portraits
 *   3. bio              → short human-readable description for the chat sidebar
 *
 * No LLM call here — this is pure template work so the compiler is fast,
 * cheap, and testable. Later we can swap in an LLM-based compiler behind the
 * same port for higher-quality bios without touching use-cases.
 */
export class TemplatePromptCompiler implements PromptCompiler {
  compile(input: PromptCompilerInput): CompiledPrompts {
    const app = input.appearance;
    const genderNoun =
      app.gender === "FEMALE" ? "woman" : app.gender === "MALE" ? "man" : "person";

    const appearancePrompt = this.buildAppearancePrompt({
      baseStyle: app.baseStyle,
      gender: app.gender,
      genderNoun,
      ethnicity: app.ethnicity,
      ageYears: app.ageYears,
      eyeColor: app.eyeColor,
      hairStyle: app.hairStyle,
      hairColor: app.hairColor,
      bodyType: app.bodyType,
      bustSize: app.bustSize,
      hipSize: app.hipSize,
      clothing: app.clothing,
      name: input.name,
    });

    const systemPrompt = this.buildSystemPrompt(input, genderNoun);
    const bio = this.buildBio(input);

    return {
      systemPrompt,
      appearancePrompt,
      bio,
      compiledAt: input.now,
    };
  }

  private buildAppearancePrompt(a: {
    baseStyle: string;
    gender: string;
    genderNoun: string;
    ethnicity: string;
    ageYears: number;
    eyeColor: string;
    hairStyle: string;
    hairColor: string;
    bodyType: string;
    bustSize: string | null;
    hipSize: string | null;
    clothing: string | null;
    name: string;
  }): string {
    const stylePrefix =
      a.baseStyle === "ANIME"
        ? "anime illustration, cel-shaded, vibrant colors, professional anime art, tasteful character design"
        : a.baseStyle === "THREE_D"
          ? "3D render, high detail, physically based rendering, fashion editorial styling"
          : a.baseStyle === "CARTOON"
            ? "stylized cartoon illustration, clean lineart, bold colors, tasteful character design"
            : "photorealistic portrait, fashion editorial photography, elegant styling, natural lighting, detailed skin texture, sharp focus";

    const clothing =
      a.clothing && a.clothing.trim().length > 0
        ? a.clothing.trim()
        : this.resolveDefaultClothing(a.baseStyle, a.gender, a.name);

    const parts: string[] = [
      stylePrefix,
      `${a.ethnicity.toLowerCase()} ${a.genderNoun}`,
      `${a.ageYears} years old`,
      `${a.eyeColor.toLowerCase()} eyes`,
      `${a.hairColor.toLowerCase()} ${a.hairStyle.toLowerCase()} hair`,
      `${a.bodyType.toLowerCase().replace("_", " ")} figure`,
    ];
    if (a.bustSize) parts.push(`bust size ${a.bustSize.toLowerCase()}`);
    if (a.hipSize) parts.push(`hips size ${a.hipSize.toLowerCase()}`);
    parts.push(`wearing ${clothing}`);
    parts.push("fully clothed, tasteful pose");
    parts.push("full body shot, portrait orientation, high quality, 4k");
    return parts.join(", ");
  }

  private resolveDefaultClothing(
    baseStyle: string,
    gender: string,
    name: string,
  ): string {
    const styleKey = CLOTHING_POOLS[baseStyle] ? baseStyle : "REALISTIC";
    const styleBucket = CLOTHING_POOLS[styleKey];
    const pool =
      styleBucket[gender] ?? styleBucket.FEMALE ?? styleBucket.MALE;
    return pickFromPool(pool, `${styleKey}:${gender}:${name}`);
  }

  private buildSystemPrompt(
    input: PromptCompilerInput,
    genderNoun: string,
  ): string {
    const lines: string[] = [
      `You are ${input.name}, a ${input.appearance.ageYears}-year-old ${input.appearance.ethnicity.toLowerCase()} ${genderNoun}.`,
      input.personality.personalityFragment,
      input.personality.relationshipFragment,
      input.personality.occupationFragment,
    ];
    if (input.hobbies.length > 0) {
      lines.push(`Hobbies: ${input.hobbies.join(", ")}.`);
    }
    if (input.backstory && input.backstory.trim().length > 0) {
      lines.push(`Backstory: ${input.backstory.trim()}`);
    }
    lines.push("");
    lines.push("Rules:");
    lines.push(`- Always respond in first person as ${input.name}. Never break character or refer to yourself as an AI, model, or assistant.`);
    lines.push(`- Match the ${input.personality.relationshipLabel.toLowerCase()} dynamic in tone, register, and pacing.`);
    lines.push(
      input.nsfwOptIn
        ? "- Explicit content is permitted when the user leads there. Always confirm consent for any real-world meetup or contact details (never actually give any)."
        : "- Keep responses safe-for-work. Redirect explicit requests warmly without moralizing.",
    );
    lines.push("- Never claim to be human. If asked directly, deflect in-character (e.g. 'why does that matter?').");
    return lines.join("\n");
  }

  private buildBio(input: PromptCompilerInput): string {
    const traits = [
      input.personality.personalityLabel.toLowerCase(),
      input.personality.occupationLabel.toLowerCase(),
    ];
    const hobbySuffix =
      input.hobbies.length > 0
        ? ` who loves ${humanJoin(input.hobbies.slice(0, 3).map((h) => h.toLowerCase()))}`
        : "";
    return `${capitalize(traits[0])} ${traits[1]}${hobbySuffix}.`;
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function humanJoin(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
