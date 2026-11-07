// The safety posture's fixed wording, in one place. Skills print these; they never paraphrase them.
export const GUARANTEE_LINE =
  "Chef never suggests a recipe that its ingredient list shows conflicts with a hard constraint you've declared, and leaves out recipes it can't verify. It can't see product labels, brands, or cross-contact, so always check labels.";

export const NOT_MEDICAL_ADVICE = 'Chef gives general information, not medical advice.';

export const NEVER_ASKED_NUDGE = 'No dietary constraints recorded. Tell me about any allergies or foods someone must never eat.';

// Meta's Muse privacy policy, which covers the "Help improve our AI models" setting. Linked, never paraphrased.
export const TRAINING_SETTING_URL = 'https://muse.ai/privacy';

export const TRAINING_NOTICE =
  `Your dietary and health details are saved in your Chef data root. On Muse, the "Help improve our AI models" setting may cover them; see ${TRAINING_SETTING_URL}.`;

export const textOnlyCaveat = (constraint) =>
  `"${constraint}" is not one of Chef's allergen flags, so Chef matches it on ingredient wording only and can miss it under another name.`;

// The one chef-setup safety screen: not medical advice, the guarantee line, the training setting.
export const SAFETY_SCREEN = [NOT_MEDICAL_ADVICE, GUARANTEE_LINE, `Muse's "Help improve our AI models" setting may cover what you tell Chef; see ${TRAINING_SETTING_URL}.`];
