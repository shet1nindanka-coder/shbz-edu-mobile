// Verification-only gallery of the design system: every primitive of `@/ui` in every state, in both
// themes. Not linked from the app. Plain English labels are fine in this one file.
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  lessonResultStatus,
  STREAK_TIER_ORDER,
  streakPalette,
  ThemeProvider,
  typography,
  useAppFonts,
  useTheme,
  type HomeworkNumberStatus,
  type LessonResultValue,
  type TextVariant,
  type ThemeMode,
} from '@/theme';
import {
  AppBar,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  CheckMark,
  CheckRow,
  Checkbox,
  Chip,
  CopyRow,
  CountBadge,
  DateTimeField,
  Dialog,
  Divider,
  EmptyState,
  Enter,
  ErrorState,
  Icon,
  ICON_NAMES,
  IconButton,
  ListRow,
  LoadingState,
  Logo,
  MetricPill,
  NavCard,
  navIcons,
  Notice,
  PageHeader,
  PasswordField,
  ProgressBar,
  Screen,
  SearchField,
  SectionCard,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  StatusBadge,
  StatusOptionGroup,
  Switch,
  Tabs,
  Text,
  TextArea,
  TextButton,
  TextField,
  TitleDot,
  type ButtonSize,
  type ButtonVariant,
  type IconName,
} from '@/ui';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'outline', 'dark', 'danger', 'dangerSolid', 'tonal'];
const BUTTON_SIZES: ButtonSize[] = ['sm', 'md', 'lg', 'field'];
const STATUSES: (HomeworkNumberStatus | null)[] = ['GREEN', 'YELLOW', 'RED', null];
const STATUS_LABEL: Record<string, string> = { GREEN: 'Зеленый', YELLOW: 'Желтый', RED: 'Красный', none: 'Не отмечено' };
const RESULTS: { value: LessonResultValue; label: string }[] = [
  { value: 'SOLVED', label: 'решил' },
  { value: 'PARTIAL', label: 'с ошибками' },
  { value: 'NOT_SOLVED', label: 'не решил' },
  { value: 'SKIPPED', label: 'не успел' },
];
const PANGRAM = 'Съешь ещё этих мягких булок — 0123456789';
const DATE_LABELS = { clear: 'Очистить', today: 'Сегодня', done: 'Готово', close: 'Закрыть', date: 'Дата', time: 'Время' };

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SectionCard title={title} card={{ padded: 18 }}>
      <View style={{ gap: 14 }}>{children}</View>
    </SectionCard>
  );
}

function Row({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap }}>{children}</View>;
}

function Caption({ children }: { children: string }) {
  return <Text variant="kickerSm">{children}</Text>;
}

function Gallery({ mode, onModeChange }: { mode: ThemeMode; onModeChange: (mode: ThemeMode) => void }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [filled, setFilled] = useState('ilya@example.com');
  const [password, setPassword] = useState('student123');
  const [area, setArea] = useState('');
  const [note, setNote] = useState('');
  const [noteFilled, setNoteFilled] = useState('Перепроверить знак во второй строке.');
  const [search, setSearch] = useState('');
  const [searchFilled, setSearchFilled] = useState('051003');
  const [checkA, setCheckA] = useState(false);
  const [checkB, setCheckB] = useState(true);
  const [rows, setRows] = useState<Record<string, boolean>>({ ilya: true, maria: false });
  const [switchA, setSwitchA] = useState(false);
  const [switchB, setSwitchB] = useState(true);
  const [seg, setSeg] = useState<ThemeMode>('light');
  const [segPlain, setSegPlain] = useState('review');
  const [lang, setLang] = useState('ru');
  const [tab, setTab] = useState<string | null>('overview');
  const [result, setResult] = useState<LessonResultValue | null>('SOLVED');
  const [resultMd, setResultMd] = useState<LessonResultValue | null>(null);
  const [select, setSelect] = useState<string | null>(null);
  const [selectSm, setSelectSm] = useState<string | null>('b');
  const [hour, setHour] = useState<number | null>(23);
  const [date, setDate] = useState('');
  const [dateFilled, setDateFilled] = useState('2026-11-20T23:59');
  const [progress, setProgress] = useState(42);
  const [dialog, setDialog] = useState(false);
  const [dialogPending, setDialogPending] = useState(false);
  const [consent, setConsent] = useState(false);
  const [plainDialog, setPlainDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectOptions = [
    { value: 'a', label: 'Квадратные уравнения' },
    { value: 'b', label: 'Тригонометрия' },
    { value: 'c', label: 'Производная и её применение' },
    { value: 'd', label: 'Отключённый вариант', disabled: true },
  ];

  return (
    <Screen
      glow="dashboard"
      testID="dev-ui"
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 800);
      }}
      header={
        <AppBar
          left={<Logo />}
          right={
            <>
              <IconButton icon="search" accessibilityLabel="Search" />
              <IconButton icon="bell" accessibilityLabel="Notifications" badge={3} />
              <IconButton icon="settings" accessibilityLabel="Settings" active />
            </>
          }
        />
      }
    >
      <PageHeader
        kicker="Design system"
        title="UI kit"
        aside={
          <Segmented
            fill
            accessibilityLabel="Theme"
            value={mode}
            onChange={onModeChange}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        }
      />

      <View style={{ gap: theme.space.sectionGap }}>
        <Enter index={0}>
          <Block title="Logo & brand">
            <Row gap={18}>
              <Logo size={26} />
              <Logo size={18} />
              <Logo size={24} variant="mono" />
            </Row>
            <View style={{ backgroundColor: theme.colors.logoDarkBg, padding: 12, borderRadius: theme.radii.md }}>
              <Logo variant="onDark" />
            </View>
            <Row>
              <TitleDot />
              <TitleDot size={10} />
              <TitleDot size={9} />
              <Avatar name="Илья Петров" />
              <Avatar name="maria" size={32} />
              <Avatar name="" size={56} />
            </Row>
          </Block>
        </Enter>

        <Enter index={1}>
          <Block title="Typography">
            {(Object.keys(typography) as TextVariant[]).map((variant) => (
              <View key={variant} style={{ gap: 2 }}>
                <Text variant="statLabel">{variant}</Text>
                <Text variant={variant}>{PANGRAM}</Text>
              </View>
            ))}
            <Text variant="metric" tabular>
              1 234 567 · tabular
            </Text>
          </Block>
        </Enter>

        <Enter index={2}>
          <Block title="Buttons">
            {BUTTON_VARIANTS.map((variant) => (
              <View key={variant} style={{ gap: 8 }}>
                <Caption>{variant}</Caption>
                <Row>
                  <Button label="Сохранить" variant={variant} />
                  <Button label="Disabled" variant={variant} disabled />
                  <Button label="Входим…" variant={variant} loading />
                </Row>
              </View>
            ))}
            <Caption>sizes</Caption>
            <Row>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} label={size} size={size} variant="outline" />
              ))}
            </Row>
            <Row>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} label={size} size={size} />
              ))}
            </Row>
            <Caption>icons · full width · loading toggle</Caption>
            <Row>
              <Button label="Добавить" leftIcon="plus" variant="dark" />
              <Button label="Удалить" leftIcon="trash" variant="danger" />
              <Button label="Удалить" variant="danger" size="sm" />
              <Button label="Далее" rightIcon="forward" variant="outline" />
            </Row>
            <Button
              label={loading ? 'Сохраняем…' : 'Сохранить изменения'}
              size="field"
              fullWidth
              loading={loading}
              onPress={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1500);
              }}
            />
            <Caption>icon buttons</Caption>
            <Row gap={14}>
              <IconButton icon="bell" accessibilityLabel="Bell" />
              <IconButton icon="bell" accessibilityLabel="Bell with badge" badge={12} />
              <IconButton icon="settings" accessibilityLabel="Active" active />
              <IconButton icon="menu" accessibilityLabel="Disabled" disabled />
              <IconButton icon="back" variant="ghost" accessibilityLabel="Back" />
              <IconButton icon="close" variant="danger" accessibilityLabel="Remove" />
              <IconButton icon="close" variant="dangerRaised" accessibilityLabel="Remove raised" />
              <IconButton icon="close" variant="danger" accessibilityLabel="Remove disabled" disabled />
            </Row>
            <Caption>text buttons · counters</Caption>
            <Row gap={18}>
              <TextButton label="Сегодня" />
              <TextButton label="Очистить" tone="danger" />
              <TextButton label="Показать" tone="soft" />
              <TextButton label="← Ко всем темам" tone="muted" variant="smallStrong" />
              <TextButton label="Disabled" disabled />
              <CountBadge count={3} />
              <CountBadge count={27} />
            </Row>
          </Block>
        </Enter>

        <Enter index={3}>
          <Block title="Text fields">
            <TextField label="Логин" placeholder="you@example.com" value={text} onChangeText={setText} />
            <TextField label="Заполнено" value={filled} onChangeText={setFilled} helper="Helper text under the field." />
            <TextField label="С ошибкой" value="abc" onChangeText={() => {}} error="Укажите корректный логин." />
            <TextField label="Disabled" value="Нельзя изменить" onChangeText={() => {}} disabled />
            <PasswordField
              label="Пароль"
              value={password}
              onChangeText={setPassword}
              showLabel="Показать"
              hideLabel="Скрыть"
            />
            <TextArea label="Комментарий" placeholder="Напишите пару строк" value={area} onChangeText={setArea} />
            <TextArea variant="note" placeholder="Заметка к номеру" value={note} onChangeText={setNote} maxLength={240} />
            <TextArea
              variant="note"
              value={noteFilled}
              onChangeText={setNoteFilled}
              maxLength={240}
              label="Заметка"
              labelAside={
                <Text variant="captionStrong" color="greenText">
                  Сохранено
                </Text>
              }
            />
            <SearchField value={search} onChangeText={setSearch} placeholder="Найти номер" submitLabel="Search" />
            <SearchField
              value={searchFilled}
              onChangeText={setSearchFilled}
              placeholder="Найти номер"
              submitLabel="Search"
              error="Номер не найден."
              keyboardType="number-pad"
            />
          </Block>
        </Enter>

        <Enter index={4}>
          <Block title="Checkbox · check row · switch">
            <Row gap={18}>
              <Checkbox checked={checkA} onChange={setCheckA} accessibilityLabel="Unchecked" />
              <Checkbox checked={checkB} onChange={setCheckB} accessibilityLabel="Checked" />
              <Checkbox checked={false} disabled accessibilityLabel="Disabled" />
              <Checkbox checked disabled accessibilityLabel="Disabled checked" />
              <CheckMark checked />
            </Row>
            <Checkbox
              checked={checkA}
              onChange={setCheckA}
              label="Я понимаю, что прогресс учеников по этой теме будет удалён."
            />
            <CheckRow
              label="Илья Петров"
              description="10 класс · группа А"
              checked={Boolean(rows.ilya)}
              onChange={(checked) => setRows((current) => ({ ...current, ilya: checked }))}
              left={<Avatar name="Илья Петров" size={32} />}
            />
            <CheckRow
              label="Мария Константинопольская-Задунайская"
              checked={Boolean(rows.maria)}
              onChange={(checked) => setRows((current) => ({ ...current, maria: checked }))}
            />
            <CheckRow label="Disabled row" checked={false} disabled />
            <Row gap={18}>
              <Switch value={switchA} onValueChange={setSwitchA} accessibilityLabel="Off" />
              <Switch value={switchB} onValueChange={setSwitchB} accessibilityLabel="On" />
              <Switch value disabled accessibilityLabel="Disabled" />
            </Row>
            <Switch
              value={switchA}
              onValueChange={setSwitchA}
              label="Автопроверка ДЗ"
              description="Ученик запускает проверку сам."
            />
            <Switch value={switchB} onValueChange={setSwitchB} label="Push-уведомления" trailing />
          </Block>
        </Enter>

        <Enter index={5}>
          <Block title="Segmented · tabs">
            <Segmented
              accessibilityLabel="Theme sample"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'system', label: 'Системная', shortLabel: 'Авто' },
                { value: 'light', label: 'Светлая' },
                { value: 'dark', label: 'Тёмная' },
              ]}
              fill
            />
            <Segmented
              accessibilityLabel="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: 'ru', label: 'RU' },
                { value: 'en', label: 'EN' },
              ]}
            />
            <Segmented
              role="tab"
              plain
              fill
              accessibilityLabel="Student tabs"
              value={segPlain}
              onChange={setSegPlain}
              options={[
                { value: 'review', label: 'Проверка ДЗ · 3' },
                { value: 'assign', label: 'Выдать ДЗ' },
                { value: 'lessons', label: 'Занятия' },
              ]}
            />
            <Segmented
              disabled
              accessibilityLabel="Disabled"
              value="on"
              onChange={() => {}}
              options={[
                { value: 'on', label: 'Включены' },
                { value: 'off', label: 'Скрыты' },
              ]}
            />
            <Tabs
              accessibilityLabel="Sections"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'overview', label: 'обзор' },
                { value: 'lesson', label: 'урок' },
                { value: 'homeworks', label: 'дз' },
                { value: 'deadlines', label: 'дедлайны' },
                { value: 'theory', label: 'теория' },
                { value: 'info', label: 'общая инфа' },
              ]}
            />
            <Row>
              <TextButton label="Clear active tab" onPress={() => setTab(null)} />
            </Row>
            <Tabs
              fill
              value="b"
              onChange={() => {}}
              options={[
                { value: 'a', label: 'уроки' },
                { value: 'b', label: 'домашние задания' },
              ]}
            />
          </Block>
        </Enter>

        <Block title="Statuses · chips · badges">
          <Row>
            {STATUSES.map((status) => (
              <StatusBadge key={String(status)} status={status} label={STATUS_LABEL[status ?? 'none'] ?? ''} />
            ))}
          </Row>
          <Row>
            <Chip tone="green" label="Проверено" />
            <Chip tone="yellow" label="На проверке" />
            <Chip tone="red" label="Просрочено" />
            <Chip tone="muted" label="Черновик" />
            <Chip tone="green" label="Решено" icon="check" />
          </Row>
          <Row>
            <Chip size="row" tone="green" label="Выдано" />
            <Chip size="row" tone="muted" label="12 номеров" />
            <Button label="Открыть" variant="outline" />
          </Row>
          <Row>
            <Badge tone="count" label="12" />
            <Badge tone="neutral" label="не успел" />
            <Badge tone="none" label="Без отметки" />
          </Row>
          <Caption>lesson result (lg)</Caption>
          <StatusOptionGroup
            accessibilityLabel="Lesson result"
            value={result}
            onChange={setResult}
            options={RESULTS.map((item) => ({ ...item, tone: lessonResultStatus[item.value] }))}
          />
          <Caption>md · nothing selected</Caption>
          <StatusOptionGroup
            accessibilityLabel="Lesson result compact"
            size="md"
            value={resultMd}
            onChange={setResultMd}
            options={RESULTS.map((item) => ({ ...item, tone: lessonResultStatus[item.value] }))}
          />
          <Caption>disabled</Caption>
          <StatusOptionGroup
            accessibilityLabel="Disabled result"
            value="PARTIAL"
            onChange={() => {}}
            disabled
            options={RESULTS.map((item) => ({ ...item, tone: lessonResultStatus[item.value] }))}
          />
        </Block>

        <Block title="Notices">
          <Notice tone="error" text="Неверный логин или пароль." />
          <Notice tone="success" text="Изменения сохранены." />
          <Notice tone="warning" text="Миграция не применена: дедлайны временно недоступны." />
          {notice ? (
            <Notice
              tone="error"
              title="Нет соединения"
              text="Показаны сохранённые данные."
              action={<TextButton label="Повторить" tone="danger" />}
              onDismiss={() => setNotice(false)}
              dismissLabel="Dismiss"
            />
          ) : (
            <TextButton label="Show dismissible notice" onPress={() => setNotice(true)} />
          )}
        </Block>

        <Block title="Select · date-time">
          <Select
            label="Тема"
            placeholder="Выбрать"
            closeLabel="Закрыть"
            value={select}
            onChange={setSelect}
            options={selectOptions}
          />
          <Select
            size="sm"
            placeholder="Выбрать"
            closeLabel="Закрыть"
            accessibilityLabel="Small select"
            value={selectSm}
            onChange={setSelectSm}
            options={selectOptions}
          />
          <Row>
            <View style={{ width: 96 }}>
              <Select
                size="xs"
                placeholder="--"
                closeLabel="Закрыть"
                accessibilityLabel="Hours"
                sheetTitle="Часы"
                value={hour}
                onChange={setHour}
                options={Array.from({ length: 24 }, (_, value) => ({ value, label: String(value).padStart(2, '0') }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Select
                placeholder="Disabled"
                closeLabel="Закрыть"
                accessibilityLabel="Disabled select"
                value={null}
                onChange={() => {}}
                options={[]}
                disabled
              />
            </View>
          </Row>
          <Select
            label="С ошибкой"
            placeholder="Выбрать"
            closeLabel="Закрыть"
            value={null}
            onChange={() => {}}
            options={selectOptions}
            error="Выберите тему."
          />
          <DateTimeField
            label="Срок сдачи"
            placeholder="Выбрать дату и время"
            labels={DATE_LABELS}
            value={date}
            onChange={setDate}
          />
          <DateTimeField
            label="Срок (en-GB)"
            locale="en"
            placeholder="Pick date and time"
            labels={DATE_LABELS}
            value={dateFilled}
            onChange={setDateFilled}
          />
          <Row>
            <DateTimeField
              variant="compact"
              placeholder="Срок"
              labels={DATE_LABELS}
              value={dateFilled}
              onChange={setDateFilled}
            />
            <DateTimeField variant="compact" placeholder="Без срока" labels={DATE_LABELS} value="" onChange={() => {}} disabled />
          </Row>
        </Block>

        <Block title="Progress · loading">
          <ProgressBar value={progress} accessibilityLabel="Progress" />
          <ProgressBar value={progress} size="md" />
          <ProgressBar value={100} size="lg" />
          <ProgressBar value={0} />
          <Row>
            <Button label="−20" variant="outline" size="sm" onPress={() => setProgress((value) => Math.max(0, value - 20))} />
            <Button label="+20" variant="outline" size="sm" onPress={() => setProgress((value) => Math.min(100, value + 20))} />
            <Spinner />
            <Spinner size={20} />
            <Spinner size={22} color="greenText" />
          </Row>
          <Skeleton width="60%" />
          <Skeleton height={48} radius="md" index={1} />
          <Skeleton height={96} radius="lg" index={2} />
          <LoadingState variant="list" count={2} accessibilityLabel="Loading" />
          <LoadingState tabs count={1} cardHeight={80} accessibilityLabel="Loading" />
          <LoadingState variant="spinner" accessibilityLabel="Loading" />
        </Block>

        <Block title="Copy row">
          <CopyRow
            label="Логин для входа"
            value="ilya@example.com"
            copiedLabel="Скопировано"
            copiedAnnouncement="Логин скопирован"
            hint="Нажмите, чтобы скопировать"
          />
          <CopyRow variant="plain" mono value="xK7-pQ2-mN9" copiedLabel="Скопировано" />
        </Block>

        <SectionCard
          title="Cards"
          description="Two floors only: page → card → soft panel."
          action={<TextButton label="Все" />}
          bare
        >
          <View style={{ gap: theme.space.lg }}>
            <NavCard
              kicker="Тема 5"
              title="Квадратные уравнения и неравенства с параметром"
              stats={[
                { label: 'Решено', value: 12 },
                { label: 'Всего', value: 30 },
                { label: 'Прогресс', value: '40%' },
              ]}
              meta="Срок: 20.11.2026"
              footer={
                <>
                  <Button label="Открыть" variant="dark" />
                  <Button label="Теория" variant="outline" />
                </>
              }
            />
            <NavCard title="Короткий заголовок" onPress={() => {}} />
            <Card>
              <Text variant="cardTitle">Card</Text>
              <Text variant="small" color="textMuted">
                Hairline + wide soft shadow.
              </Text>
              <Card variant="soft" style={{ marginTop: 12 }}>
                <Text variant="kickerSm">Soft panel</Text>
                <Text variant="miniStat" tabular>
                  19 / 24
                </Text>
              </Card>
            </Card>
            <Card variant="surface">
              <Text variant="smallStrong">Surface (legacy shadow)</Text>
            </Card>
            <Card variant="panel">
              <Text variant="smallStrong">Panel</Text>
            </Card>
            <Card variant="outline" padded={16} selected onPress={() => {}} accessibilityLabel="Selected number card">
              <Row>
                <CheckMark checked />
                <View style={{ flex: 1 }} />
                <StatusBadge status="YELLOW" label="Желтый" />
              </Row>
              <Text variant="numberTitle" style={{ marginTop: 8 }}>
                № 051003
              </Text>
              <Text variant="caption">Selected: 2px accent ring</Text>
            </Card>
            <Card
              variant="outline"
              dashed
              onPress={() => {}}
              accessibilityLabel="Compose"
              style={{ borderWidth: theme.borders.interactive, borderColor: theme.colors.inputBorder }}
            >
              <Row gap={14}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: theme.colors.greenSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="plus" size={18} color="greenText" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold">Составить занятие</Text>
                  <Text variant="caption">Dashed border = invitation</Text>
                </View>
              </Row>
            </Card>
            <Row>
              <MetricPill label="Учеников" value={24} />
              <MetricPill label="Сдано" value="18" tone="success" />
              <MetricPill label="Долги" value={3} tone="danger" />
              <MetricPill label="Ждут" value={2} tone="warning" />
            </Row>
          </View>
        </SectionCard>

        <Block title="Headers">
          <PageHeader
            gap={0}
            kicker="Ученик"
            title="Домашние задания"
            aside={<SearchField value="" onChangeText={() => {}} placeholder="Найти номер" submitLabel="Search" />}
          />
          <Divider />
          <PageHeader
            gap={0}
            backLabel="← Ко всем темам"
            onBack={() => {}}
            title="Очень длинное название темы, которое переносится на вторую строку"
            description="Описание темы: что входит и на что обратить внимание."
            metrics={[
              { label: 'Номеров', value: 30 },
              { label: 'Решено', value: 12, tone: 'success' },
            ]}
          />
          <Divider />
          <View style={{ borderWidth: 1, borderColor: theme.colors.softBorder, borderRadius: theme.radii.md, overflow: 'hidden' }}>
            <AppBar
              safeTop={false}
              title="Илья Петров"
              subtitle="10 класс · группа А"
              onBack={() => {}}
              backLabel="Back"
              right={<IconButton icon="more" variant="ghost" accessibilityLabel="More" />}
            />
          </View>
        </Block>

        <Block title="List rows">
          <View>
            <ListRow
              inset={0}
              title="Тригонометрия"
              subtitle="12 из 30 номеров · срок 20.11.2026"
              left={<Avatar name="Т" size={36} />}
              onPress={() => {}}
            />
            <ListRow inset={0} title="Непрочитанное уведомление" subtitle="Проверка завершена" emphasized meta="12:40" onPress={() => {}} />
            <ListRow inset={0} title="Статичная строка" meta="значение" />
            <ListRow
              inset={0}
              title="Со своим правым блоком"
              right={<StatusBadge status="GREEN" label="Зеленый" />}
              onPress={() => {}}
            />
            <ListRow inset={0} title="Disabled" onPress={() => {}} disabled divider={false} />
          </View>
        </Block>

        <Block title="States">
          <EmptyState title="Номера пока не добавлены" hint="Добавьте номера во вкладке «Редактирование»." />
          <EmptyState
            title="Нет занятий"
            hint="Составьте первое занятие."
            action={<Button label="Составить" variant="dark" />}
          />
          <EmptyState variant="plain" title="Уведомлений нет" />
          <ErrorState
            title="Раздел временно недоступен"
            description="Во время загрузки кабинета что-то пошло не так. Попробуйте повторить запрос или вернуться на главную страницу."
            retryLabel="Попробовать снова"
            onRetry={() => {}}
            secondaryLabel="На главную"
            onSecondary={() => {}}
          />
          <ErrorState
            numeral="404"
            title="Страница не найдена"
            description="Возможно, эта страница была удалена или вы перешли по неверной ссылке."
            retryLabel="На главную"
            onRetry={() => {}}
          />
        </Block>

        <Block title="Overlays">
          <Row>
            <Button label="Confirm dialog" variant="danger" onPress={() => setDialog(true)} testID="open-dialog" />
            <Button label="Plain dialog" variant="outline" onPress={() => setPlainDialog(true)} testID="open-plain-dialog" />
            <Button label="Bottom sheet" variant="dark" onPress={() => setSheet(true)} testID="open-sheet" />
          </Row>
        </Block>

        <Block title="Streak tiers">
          {STREAK_TIER_ORDER.map((tier) => {
            const palette = streakPalette(tier, theme.colors);
            return (
              <LinearGradient
                key={tier}
                colors={[palette.bgStart, palette.bgEnd]}
                start={theme.gradients.streakDirection.start}
                end={theme.gradients.streakDirection.end}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.md,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}
              >
                <Icon name="flame" size={16} tint={palette.flame} />
                <Text variant="kickerSm" style={{ color: palette.text, flex: 1 }}>
                  {tier}
                </Text>
                <Text variant="smallExtra" style={{ color: palette.text }}>
                  серия
                </Text>
              </LinearGradient>
            );
          })}
        </Block>

        <Block title="Icons">
          <Row gap={14}>
            {ICON_NAMES.map((name: IconName) => (
              <View key={name} style={{ width: 62, alignItems: 'center', gap: 4 }}>
                <Icon name={name} size={22} />
                <Text variant="statLabel" numberOfLines={1} style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {name}
                </Text>
              </View>
            ))}
          </Row>
          <Caption>nav icons: student · teacher · developer</Caption>
          {(['student', 'teacher', 'developer'] as const).map((role) => (
            <Row key={role} gap={18}>
              {Object.entries(navIcons[role]).map(([key, name]) => (
                <Icon key={key} name={name} size={22} color="tabText" />
              ))}
            </Row>
          ))}
        </Block>
      </View>

      <Dialog
        visible={dialog}
        kicker="Подтверждение"
        title="Удалить тему?"
        description="Тема, её номера и прогресс всех учеников по ней будут удалены без возможности восстановления."
        confirmLabel="Да, удалить"
        cancelLabel="Отмена"
        pendingLabel="Удаляем…"
        pending={dialogPending}
        confirmDisabled={!consent}
        onCancel={() => setDialog(false)}
        onConfirm={() => {
          setDialogPending(true);
          setTimeout(() => {
            setDialogPending(false);
            setDialog(false);
            setConsent(false);
          }, 1200);
        }}
        testID="dialog"
      >
        <Checkbox checked={consent} onChange={setConsent} label="Я понимаю последствия" testID="consent" />
      </Dialog>
      <Dialog
        visible={plainDialog}
        tone="default"
        kicker="Выдача"
        title="Выдать ДЗ двум ученикам?"
        confirmLabel="Выдать"
        cancelLabel="Отмена"
        onCancel={() => setPlainDialog(false)}
        onConfirm={() => setPlainDialog(false)}
      />
      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        closeLabel="Закрыть"
        title="Уведомления"
        padded={false}
        footer={<Button label="Готово" variant="dark" fullWidth onPress={() => setSheet(false)} />}
        testID="sheet"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <ListRow
            key={index}
            title={`Проверка ДЗ завершена · ${index + 1}`}
            subtitle="Тригонометрия: 3 верно, 1 с ошибкой."
            emphasized={index < 2}
            inset={20}
            meta="12:40"
            chevron={false}
            onPress={() => {}}
          />
        ))}
      </BottomSheet>
    </Screen>
  );
}

export default function DevUiRoute() {
  const { loaded, error } = useAppFonts();
  const [mode, setMode] = useState<ThemeMode>('system');
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider mode={mode}>
        <Gallery mode={mode} onModeChange={setMode} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
