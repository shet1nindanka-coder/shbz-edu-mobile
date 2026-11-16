// Font loading. Each weight is imported from its own sub-path: the package index requires all 18 cuts
// and would bundle every one of them.
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat/800ExtraBold';
import { Montserrat_900Black } from '@expo-google-fonts/montserrat/900Black';
import Feather from '@expo/vector-icons/Feather';
import { useFonts } from 'expo-font';

/** Font map of the app: the six Montserrat weights in use (Cyrillic included) and the icon font. */
export const appFonts = {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
  ...Feather.font,
};

export type AppFontsState = {
  /** True once every font is registered; render the app (and hide the splash) only after this. */
  loaded: boolean;
  /** Set when loading failed; the app may still render with system fonts. */
  error: Error | null;
};

/** Loads the app fonts once. Call in the root layout and keep the splash screen until `loaded || error`. */
export function useAppFonts(): AppFontsState {
  const [loaded, error] = useFonts(appFonts);
  return { loaded, error };
}
