// Pure domain helpers ported 1:1 from the site (docs/spec/09-data-i18n-math.md §1.6): no React, no React
// Native, no I/O. Import from "@/domain" or from the topical module ("@/domain/numbers").
//
// By topic:
//   enums                         Prisma enums as value objects + string unions
//   moscow-time, dates            Moscow day arithmetic (fixed UTC+3) and date formatters
//   numbers, text, files          problem numbers, text normalisers, MIME / extensions / upload lists
//   statuses, progress-policy,    traffic-light status meta, the single rule for status writes,
//   solution-check-*              AI verdict → status, student-facing view, check errors
//   homework-*, student-deadline-groups   attention order, labels, deadline mirror, deadline items
//   lesson-status, lesson-live, lesson-plan, homework-plan, plan-error   lessons and AI planning
//   attendance, report-period, week-buckets, group-statistics            groups and reports
//   parent-call-state             parent-call reminders
//   student-streak, student-streak-colors, progress-timeline             streak and progress charts
//   account-validation, password-policy, password-generate, upload-validation, upload-file-name, file-access
//   topic-import, topic-import-prompt, topic-numbers-change, teacher-topic-selection      content
//   latex-line-items, math-line-breaks                                   math rendering
//   notification-text, audit-text, developer-alerts, developer-panel-tabs, ai-pricing, ai-output-language,
//   check-queue-state, exam-scores
export * from "./account-validation";
export * from "./ai-output-language";
export * from "./ai-pricing";
export * from "./attendance";
export * from "./audit-text";
export * from "./check-queue-state";
export * from "./dates";
export * from "./developer-alerts";
export * from "./developer-panel-tabs";
export * from "./enums";
export * from "./exam-scores";
export * from "./file-access";
export * from "./files";
export * from "./group-statistics";
export * from "./homework-attention";
export * from "./homework-deadline-mirror";
export * from "./homework-label";
export * from "./homework-plan";
export * from "./latex-line-items";
export * from "./lesson-live";
export * from "./lesson-plan";
export * from "./lesson-status";
export * from "./math-line-breaks";
export * from "./moscow-time";
export * from "./notification-text";
export * from "./numbers";
export * from "./parent-call-state";
export * from "./password-generate";
export * from "./password-policy";
export * from "./plan-error";
export * from "./progress-policy";
export * from "./progress-timeline";
export * from "./report-period";
export * from "./solution-check-error-text";
export * from "./solution-check-history";
export * from "./solution-check-parse";
export * from "./solution-check-status";
export * from "./solution-check-student-view";
export * from "./statuses";
export * from "./student-deadline-groups";
export * from "./student-streak";
export * from "./student-streak-colors";
export * from "./teacher-topic-selection";
export * from "./text";
export * from "./topic-import";
export * from "./topic-import-prompt";
export * from "./topic-numbers-change";
export * from "./upload-file-name";
export * from "./upload-validation";
export * from "./week-buckets";
