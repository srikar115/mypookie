import type { CompanionVisualProfile } from "../../application/ports/companion-visual-profile-reader";
import type { CompanionVisualPromptBuilder } from "../../application/use-cases/run-media-generation.use-case";

/**
 * Builds the fal prompt for an in-chat generation.
 *
 * The guiding rule is that the request is sent as written. Whatever the user
 * (or the companion, via the <<VA>> sentinel) asked for is the prompt — we do
 * not prepend a description, append quality boilerplate, or substitute a
 * different scene. An earlier version wrapped every request in an identity
 * prefix and a "photorealistic, highly detailed" suffix, which on an *edit*
 * model is worse than useless: the reference image already establishes who she
 * is, so restating it competes with the change actually being asked for.
 *
 * The single exception is a text-to-image run with no reference image. Nothing
 * else in that request conveys her likeness, so an identity core derived from
 * the structured columns (heritage, gender, age, hair, eyes, build) is
 * prepended. It deliberately covers only intrinsic traits — never wardrobe,
 * pose, framing, or lighting — so it cannot override the scene.
 *
 * `characters.appearancePrompt` is never used here. The portrait wizard
 * compiles it for one specific hero shot, ending in a fixed outfit and framing
 * ("wearing a champagne evening gown with an open back, full body shot"), so
 * pasting it in front of "photo in tshirt" produces a gown.
 */

const ETHNICITY_LABEL: Record<string, string> = {
  CAUCASIAN: "caucasian",
  LATINA: "latina",
  ASIAN: "asian",
  ARAB: "arab",
  EBONY: "ebony",
  MIXED: "mixed-heritage",
  OTHER: "",
  EAST_ASIAN: "east asian",
  SOUTHEAST_ASIAN: "southeast asian",
  SOUTH_ASIAN: "south asian",
  MIDDLE_EASTERN: "middle eastern",
  NORTH_AFRICAN: "north african",
  BLACK: "black",
  CARIBBEAN: "afro-caribbean",
  EUROPEAN: "european",
};

const GENDER_NOUN: Record<string, string> = {
  FEMALE: "woman",
  MALE: "man",
  NONBINARY: "person",
  TRANS_WOMAN: "woman",
  TRANS_MAN: "man",
};

const HAIR_STYLE_LABEL: Record<string, string> = {
  STRAIGHT: "straight hair",
  WAVY: "wavy hair",
  CURLY: "curly hair",
  KINKY: "kinky hair",
  BUNS: "hair in buns",
  BRAIDS: "braided hair",
  PONYTAIL: "hair in a ponytail",
  PIXIE: "pixie cut",
  LONG: "long hair",
};

const HAIR_COLOR_LABEL: Record<string, string> = {
  BLACK: "black",
  DARK_BROWN: "dark brown",
  BROWN: "brown",
  LIGHT_BROWN: "light brown",
  BLONDE: "blonde",
  PLATINUM: "platinum blonde",
  RED: "red",
  AUBURN: "auburn",
  GRAY: "gray",
  WHITE: "white",
  FANTASY_OTHER: "fantasy-colored",
};

const EYE_COLOR_LABEL: Record<string, string> = {
  BROWN: "brown eyes",
  DARK_BROWN: "dark brown eyes",
  GREEN: "green eyes",
  BLUE: "blue eyes",
  HAZEL: "hazel eyes",
  GRAY: "gray eyes",
  AMBER: "amber eyes",
  VIOLET: "violet eyes",
};

const BODY_TYPE_LABEL: Record<string, string> = {
  SLIM: "slim figure",
  ATHLETIC: "athletic build",
  CURVY: "curvy figure",
  PLUS_SIZE: "plus-size figure",
  PETITE: "petite frame",
  VOLUPTUOUS: "voluptuous figure",
};

/**
 * The stable part of the character's look. Everything here is intrinsic to who
 * she is — never wardrobe, pose, framing, or lighting, so it can be safely
 * prefixed to any scene the user asks for.
 */
function buildIdentityCore(profile: CompanionVisualProfile): string {
  const genderNoun = GENDER_NOUN[profile.gender] ?? "person";
  const ethnicity = ETHNICITY_LABEL[profile.ethnicity] ?? "";
  const hairColor =
    HAIR_COLOR_LABEL[profile.hairColor] ?? profile.hairColor.toLowerCase();
  const hairStyle =
    HAIR_STYLE_LABEL[profile.hairStyle] ?? profile.hairStyle.toLowerCase();
  const eyes = EYE_COLOR_LABEL[profile.eyeColor] ?? `${profile.eyeColor.toLowerCase()} eyes`;
  const body = BODY_TYPE_LABEL[profile.bodyType] ?? "";

  const subject = [ethnicity, genderNoun].filter(Boolean).join(" ");

  return [
    subject,
    profile.ageYears ? `${profile.ageYears} years old` : "",
    `${hairColor} ${hairStyle}`.trim(),
    eyes,
    body,
  ]
    .filter(Boolean)
    .join(", ");
}

function styleSuffix(style: string): string {
  const map: Record<string, string> = {
    Photoreal: "photorealistic, highly detailed, professional photography",
    Cinematic: "cinematic lighting, film grain, dramatic depth of field",
    Editorial: "editorial fashion photography, studio lighting, high fashion",
    "Soft natural light": "soft natural lighting, golden hour, warm tones",
    Anime: "anime illustration, cel-shaded, vibrant, professional anime art",
    Illustration: "digital illustration, detailed art, painterly style",
  };
  return map[style] ?? style.toLowerCase();
}

export class CompanionVisualPromptBuilderImpl implements CompanionVisualPromptBuilder {
  build(input: {
    userScene: string;
    profile: CompanionVisualProfile | null;
    style: string | null;
    hasReference: boolean;
    promptIsFinal: boolean;
  }): string {
    const { userScene, profile, style, hasReference, promptIsFinal } = input;
    const scene = userScene.trim();

    const parts: string[] = [];

    // Identity is only ever added when the request would otherwise carry no
    // likeness at all: a text-to-image run whose prompt the caller hasn't
    // already finalised. With a reference image the model is editing an
    // existing photo of her, and a prompt shown in the composer has had its
    // identity resolved already — describing her again in either case just
    // gives the model a second, competing subject.
    if (!promptIsFinal && !hasReference && profile) {
      parts.push(buildIdentityCore(profile));
    }

    parts.push(scene);

    // An explicitly chosen style preset is honoured because the user picked it;
    // there is deliberately no default here, since a blanket "photorealistic,
    // highly detailed" tail is exactly the boilerplate this builder no longer
    // adds.
    if (style) parts.push(styleSuffix(style));

    return parts.filter(Boolean).join(", ");
  }
}
