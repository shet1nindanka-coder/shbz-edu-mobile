import type { ReactNode } from 'react';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type ExamSectionProps = {
  title: string;
  children: ReactNode;
  testID?: string;
};

/** A titled card of the exam info screen: the title (17 / 700) sits inside the card, above its content. */
export function ExamSection({ title, children, testID }: ExamSectionProps) {
  const styles = useStyles();
  return (
    <Card style={styles.card} testID={testID}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
}));
