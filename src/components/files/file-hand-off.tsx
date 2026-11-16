// The page shown for a file the app cannot render itself (DOCX everywhere, PDF on Android): what the
// file is, why there is no preview, and one button that hands it to another app.
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Icon, Text } from '@/ui';

export type FileHandOffProps = {
  name: string;
  /** "PDF", "DOCX"… */
  typeLabel: string;
  hint: string;
  onOpenExternally: () => void;
  opening: boolean;
};

export function FileHandOff({ name, typeLabel, hint, onOpenExternally, opening }: FileHandOffProps) {
  const styles = useStyles();
  const { m } = useI18n();
  return (
    <View style={styles.root}>
      <View style={styles.tile}>
        <Icon name="file" size={26} color="greenText" />
      </View>
      <View style={styles.text}>
        <Text variant="bodyBold" align="center" numberOfLines={3}>
          {name}
        </Text>
        {typeLabel ? (
          <Text variant="captionStrong" color="kicker" align="center">
            {typeLabel}
          </Text>
        ) : null}
        <Text variant="small" color="textMuted" align="center">
          {hint}
        </Text>
      </View>
      <Button
        label={m.common.files.openInAnotherApp}
        leftIcon="externalLink"
        loading={opening}
        onPress={onOpenExternally}
        style={styles.button}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.space.lg, padding: 24 },
  tile: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.greenSoft,
  },
  text: { gap: t.space.xs, maxWidth: 320 },
  button: { alignSelf: 'center' },
}));
