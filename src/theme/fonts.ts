// Font loading. Each weight is imported from its own sub-path: the package index requires all 9 cuts
// and would bundle every one of them. Icons are drawn with react-native-svg (Lucide), so there is no
// icon font.
import { Onest_400Regular } from '@expo-google-fonts/onest/400Regular';
import { Onest_500Medium } from '@expo-google-fonts/onest/500Medium';
import { Onest_600SemiBold } from '@expo-google-fonts/onest/600SemiBold';
import { Onest_700Bold } from '@expo-google-fonts/onest/700Bold';
import { Onest_800ExtraBold } from '@expo-google-fonts/onest/800ExtraBold';
import { Onest_900Black } from '@expo-google-fonts/onest/900Black';
import { useFonts } from 'expo-font';

/** Font map of the app: the six Onest weights in use (Cyrillic included). */
export const appFonts = {
  Onest_400Regular,
  Onest_500Medium,
  Onest_600SemiBold,
  Onest_700Bold,
  Onest_800ExtraBold,
  Onest_900Black,
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
