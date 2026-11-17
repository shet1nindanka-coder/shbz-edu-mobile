// UI kit of the app: every primitive of docs/spec/08-design-system.md §5. Components take their texts
// through props (no i18n import) and read every colour, radius and font from the theme.
export { AccentGradient, type AccentGradientProps } from './accent-gradient';
export { AppBar, type AppBarProps } from './app-bar';
export { Avatar, type AvatarProps } from './avatar';
export { Badge, type BadgeProps, type BadgeTone } from './badge';
export { BottomSheet, type BottomSheetProps } from './bottom-sheet';
export { OverlayCoverSlot, coveredAccessibilityProps, isOverlayCovered, setOverlayCover, useOverlayCovered } from './overlay-cover';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './button';
export { Card, CardPressArea, type CardPressAreaProps, type CardProps, type CardVariant } from './card';
export { accessibilityLabelOf, withErrorHint, type AccessibilityPart } from './a11y';
export { announceOnIOS, useAnnounce } from './use-announce';
export { useCloseOnBlur } from './internal/close-on-blur';
export { effectiveFontScale, minimumFontScaleFor, widthForText } from './font-scale';
export { useTextScale, type TextScale } from './use-text-scale';
export { CheckMark, type CheckMarkProps } from './check-mark';
export { CheckRow, type CheckRowProps } from './check-row';
export { Checkbox, type CheckboxProps } from './checkbox';
export { Chip, chipColors, type ChipProps, type ChipTone } from './chip';
export { CopyRow, type CopyRowProps } from './copy-row';
export { useCopyFeedback } from './use-copy-feedback';
export { CountBadge, type CountBadgeProps } from './count-badge';
export { DateTimeField, type DateTimeFieldLabels, type DateTimeFieldProps } from './date-time-field';
export { Dialog, type DialogProps } from './dialog';
export { Divider, type DividerProps } from './divider';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { Enter, type EnterProps } from './enter';
export { ErrorState, type ErrorStateProps } from './error-state';
export { Icon, ICON_NAMES, navIcons, type IconName, type IconProps } from './icon';
export { IconButton, type IconButtonProps, type IconButtonVariant } from './icon-button';
export {
  formatDateTimeDisplay,
  formatDateTimeValue,
  parseDateTimeValue,
  todayDateTimeValue,
  type DateTimeLocale,
  type DateTimeParts,
} from './internal/date-time';
export { hitSlopFor, PressableScale, type PressableScaleProps, type PressableState } from './internal/pressable-scale';
export { ListRow, type ListRowProps } from './list-row';
export { LoadingState, type LoadingStateProps } from './loading-state';
export { Logo, type LogoProps } from './logo';
export { MetricPill, type MetricPillProps } from './metric-pill';
export { NavCard, type NavCardProps, type NavCardStat } from './nav-card';
export { Notice, type NoticeProps, type NoticeTone } from './notice';
export { PageGlow, type PageGlowProps } from './page-glow';
export { PageHeader, type PageHeaderMetric, type PageHeaderProps } from './page-header';
export { PasswordField, type PasswordFieldProps } from './password-field';
export { completionPercent, ProgressBar, type ProgressBarProps } from './progress-bar';
export { Screen, type ScreenProps } from './screen';
export { SearchField, type SearchFieldProps } from './search-field';
export { SectionCard, type SectionCardProps } from './section-card';
export { Segmented, type SegmentedOption, type SegmentedProps } from './segmented';
export { Select, type SelectOption, type SelectProps } from './select';
export { Skeleton, type SkeletonProps } from './skeleton';
export { Spinner, type SpinnerProps } from './spinner';
export { StatusBadge, type StatusBadgeProps } from './status-badge';
export { StatusOptionGroup, type StatusOption, type StatusOptionGroupProps } from './status-option-group';
export { Switch, type SwitchProps } from './switch';
export { Tabs, type TabOption, type TabsProps } from './tabs';
export { MAX_FONT_SCALE, Text, type TextProps } from './text';
export { TextArea, type TextAreaProps } from './text-area';
export { TextButton, type TextButtonProps, type TextButtonTone } from './text-button';
export { TextField, type TextFieldProps } from './text-field';
export { WindowFrameProvider, WindowInsetsScope, useWindowContentTop, useWindowInsets, type WindowFrameProviderProps, type WindowInsetsScopeProps } from './window-insets';
export { TitleDot, type TitleDotProps } from './title-dot';
