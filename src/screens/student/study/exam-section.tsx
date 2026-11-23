import type { ReactNode } from 'react';

import { Panel, Text } from '@/ui';

export type ExamSectionProps = {
  title: string;
  children: ReactNode;
  testID?: string;
};

/**
 * A titled block of the exam info screen: the title (17 / 700; 20 on a tablet) sits inside the card, above
 * its content. On a tablet the blocks stand side by side as full-height panels.
 */
export function ExamSection({ title, children, testID }: ExamSectionProps) {
  return (
    <Panel
      header={
        <Text variant="sectionTitle" accessibilityRole="header">
          {title}
        </Text>
      }
      testID={testID}
    >
      {children}
    </Panel>
  );
}
