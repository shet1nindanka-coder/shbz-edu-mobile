import { useI18n } from '@/i18n';
import { Button } from '@/ui';

import type { CreateAccountForm } from './use-create-account-form';

/** «Создать ученика» / «Создать учителя»: the main action of the "new account" form. */
export function CreateAccountSubmit({ form }: { form: CreateAccountForm }) {
  const { dict } = useI18n();
  const t = dict.students.accountForm;
  return (
    <Button
      label={form.pending ? t.creating : form.isStudent ? t.createStudent : t.createTeacher}
      size="lg"
      leftIcon="plus"
      fullWidth
      loading={form.pending}
      disabled={!form.canSubmit}
      onPress={form.submit}
      testID="create-account-submit"
    />
  );
}
