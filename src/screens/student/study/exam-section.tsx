import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type ExamSectionProps = {
  title: string;
  children: ReactNode;
  testID?: string;
};

/** A titled card of the exam info screen (`.shbz-section-title` + `.shbz-card`). */
export function ExamSection({ title, children, testID }: ExamSectionProps) {
  const styles = useStyles();
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {title}
      </Text>
      <Card padded={12}>
        <View style={styles.content}>{children}</View>
      </Card>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.md },
  content: { gap: t.space.sm },
}));
