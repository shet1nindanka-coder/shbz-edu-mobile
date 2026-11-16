import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Text } from '@/ui';

export type HomeSectionProps = {
  title: string;
  children: ReactNode;
  testID?: string;
};

/** A titled block of the overview (`.shbz-section-title` + content). */
export function HomeSection({ title, children, testID }: HomeSectionProps) {
  const styles = useStyles();
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.md },
}));
