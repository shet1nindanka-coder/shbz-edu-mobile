import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet } from '@/ui';

import { CreateAccountFields } from './create-account-fields';
import { CreateAccountSubmit } from './create-account-submit';
import type { CreateAccountForm } from './use-create-account-form';

export type CreateAccountSheetProps = {
  visible: boolean;
  /** State of the form; it lives in the screen, so the typed values survive closing the sheet by accident. */
  form: CreateAccountForm;
  onClose: () => void;
  /** After the exit animation: the caller opens the credentials sheet only now. */
  onClosed?: () => void;
};

/**
 * "New account" on a phone (docs/spec/04-teacher-students.md S9a; layout: docs/design/glass-over-paper.md
 * §1 rule 6): the form is folded behind the header button and opens as a sheet. A tablet shows the same
 * fields in the panel next to the directory.
 */
export function CreateAccountSheet({ visible, form, onClose, onClosed }: CreateAccountSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();

  return (
    <BottomSheet
      visible={visible}
      onClose={() => {
        if (!form.pending) onClose();
      }}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={dict.students.accounts.newAccount}
      dismissible={!form.pending}
      testID="create-account-sheet"
      footer={<CreateAccountSubmit form={form} />}
    >
      <View style={styles.content}>
        <CreateAccountFields form={form} />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md, paddingBottom: t.space.md },
}));
