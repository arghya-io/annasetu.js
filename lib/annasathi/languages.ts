/**
 * Languages AnnaSathi can be switched to. Selecting one only changes the
 * label shown in this UI for now — there is no live translation or speech
 * pipeline wired up yet (see the boundary note in annasathi-chat.tsx). Add
 * more Bhashini-supported languages here when that pipeline exists; nothing
 * else needs to change.
 */
export interface AnnaSathiLanguage {
  code: string;
  nativeName: string;
  englishName: string;
}

export const ANNASATHI_LANGUAGES: AnnaSathiLanguage[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali' },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi' },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu' },
];

export const DEFAULT_ANNASATHI_LANGUAGE = ANNASATHI_LANGUAGES[0]!;
