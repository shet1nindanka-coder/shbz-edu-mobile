import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import type { Theme } from './theme';
import { useTheme } from './theme-provider';

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Theme-aware `StyleSheet.create`. Call at module scope, use the returned hook inside the component:
 *
 *   const useStyles = makeStyles((t) => ({ box: { backgroundColor: t.colors.cardBg, padding: t.space.card } }));
 *   function Box() { const styles = useStyles(); return <View style={styles.box} />; }
 *
 * The sheet is built once per theme object (there are exactly two) and reused by every instance.
 */
export function makeStyles<S extends NamedStyles>(factory: (theme: Theme) => S): () => S {
  const cache = new WeakMap<Theme, S>();
  return function useStyles(): S {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme)) as S;
      cache.set(theme, styles);
    }
    return styles;
  };
}
