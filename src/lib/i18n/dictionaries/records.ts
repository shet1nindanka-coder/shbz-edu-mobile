// Тексты записей, которые хранятся в БД: summary журнала действий (AuditLog)
// и уведомления (Notification). В базу пишется русский текст + ключ и параметры
// (AuditLog.meta.i18n / Notification.params), а на экране текст собирается
// заново на языке интерфейса — см. lib/audit-text.ts и lib/notification-text.ts.
// Английская версия типизирована русской.
export const auditRu = {
  templates: {
    "auth.login": "Вход в систему",
    "auth.login.failed": "Неудачный вход: {login}",
    "auth.logout": "Выход из системы",
    "student.created": "Создан ученик {name}",
    "student.deleted": "Удалён ученик {name} со всеми работами",
    "student.password_reset": "Сброшен пароль ученика",
    "teacher.password_reset": "Сброшен пароль учителя",
    "account.created": "Создан аккаунт {name} ({role})",
    "account.owner_changed": "Смена владельца у учеников: {count}",
    "teacher.deleted": "Удалён учитель {name}; учеников переведено: {count}",
    "topic.created": "Создана тема «{title}», номеров: {count}",
    "topic.deleted": "Удалена тема, файлов вычищено: {count}",
    // {startsAt} — ISO-дата, форматируется по языку.
    "lesson.scheduled": "Время урока: {startsAt}",
    "lesson.finished_early": "Урок завершён досрочно",
    "lesson.auto_results":
      "Итоги закрыты автоматически: не решил — {notSolved}, не успел — {skipped}, отметок посещаемости — {attendance}",
    "solution.check": "Автопроверка: верно {correct}, с ошибкой {incorrect}, не распознано {uncertain}",
    "solution.check.failed": "Автопроверка не удалась",
    // {verdict} — код correct/incorrect/uncertain, подпись из verdicts.
    "lesson_item.check": "Классная работа: № {number} — {verdict}",
    "lesson_item.check.failed": "Проверка классной работы не удалась",
    "lesson_plan.shortlist": "Отбор кандидатов на урок для ученика {name}",
    "lesson_plan.generate": "Подбор набора на урок для ученика {name}",
    "homework_plan.shortlist": "Отбор кандидатов в ДЗ для ученика {name}",
    "homework_plan.generate": "Подбор домашнего задания для ученика {name}",
    // Действия дев-панели: тот же текст показывается разработчику как результат.
    "developer.settings_saved": "Настройки сохранены и применены — подействуют в течение 15 секунд.",
    "developer.settings_failed": "Не удалось сохранить настройки. Применена ли миграция SiteSetting?",
    "developer.ai_disabled": "Автопроверка выключена или не настроен ключ/модель.",
    "developer.ai_ping": "Модель отвечает: {model} · {elapsedMs} мс.",
    "developer.ai_ping_failed": "Модель недоступна: {reason}.",
    "developer.ai_ping_timeout": "Модель недоступна: таймаут 20 секунд.",
    "developer.retention_run": "Автоудаление выполнено: снято ссылок на фото — {photos}, удалено файлов — {files}.",
    "developer.retention_failed": "Автоудаление не выполнено — подробности в логах сервера.",
    "developer.ai_budget_reset": "Дневной бюджет автопроверки сброшен.",
    "developer.ai_budget_reset_failed": "Не удалось сбросить бюджет — подробности в логах сервера.",
    "developer.checks_unfrozen": "Зависших проверок снято: {count}.",
    "developer.checks_unfrozen_failed": "Не удалось снять зависшие проверки — подробности в логах сервера.",
    "developer.caches_flushed": "Кэши платформы сброшены.",
    "developer.broadcast_invalid": "Заполните заголовок и выберите получателей.",
    "developer.broadcast_sent": "Уведомление отправлено ученикам: {count}.",
    // Коды source/previousStatus/status/decision — подписи из dict.progress.
    "progress.status": "{source}: {previousStatus} → {status}. {decision}"
  },
  verdicts: {
    correct: "верно",
    incorrect: "с ошибкой",
    uncertain: "не распознано"
  },
  // Имена системных акторов — снимок в AuditLog.actorName.
  actors: {
    autoCheck: "Автопроверка",
    lessonAutoFinish: "Автозавершение урока"
  }
};

export const auditEn: typeof auditRu = {
  templates: {
    "auth.login": "Signed in",
    "auth.login.failed": "Failed sign-in: {login}",
    "auth.logout": "Signed out",
    "student.created": "Student {name} created",
    "student.deleted": "Student {name} deleted with all their work",
    "student.password_reset": "Student's password reset",
    "teacher.password_reset": "Teacher's password reset",
    "account.created": "Account {name} created ({role})",
    "account.owner_changed": "Students reassigned to another teacher: {count}",
    "teacher.deleted": "Teacher {name} deleted; students reassigned: {count}",
    "topic.created": "Topic “{title}” created, problems: {count}",
    "topic.deleted": "Topic deleted, files cleaned up: {count}",
    "lesson.scheduled": "Lesson time: {startsAt}",
    "lesson.finished_early": "Lesson finished early",
    "lesson.auto_results":
      "Results closed automatically: not solved — {notSolved}, not reached — {skipped}, attendance marks — {attendance}",
    "solution.check": "AI check: correct {correct}, incorrect {incorrect}, unrecognised {uncertain}",
    "solution.check.failed": "AI check failed",
    "lesson_item.check": "Classwork: problem {number} — {verdict}",
    "lesson_item.check.failed": "Classwork check failed",
    "lesson_plan.shortlist": "Shortlisting lesson candidates for {name}",
    "lesson_plan.generate": "Selecting a lesson set for {name}",
    "homework_plan.shortlist": "Shortlisting homework candidates for {name}",
    "homework_plan.generate": "Selecting homework for {name}",
    "developer.settings_saved": "Settings saved and applied — they take effect within 15 seconds.",
    "developer.settings_failed": "Could not save the settings. Has the SiteSetting migration been applied?",
    "developer.ai_disabled": "AI check is turned off or the key/model is not configured.",
    "developer.ai_ping": "The model responds: {model} · {elapsedMs} ms.",
    "developer.ai_ping_failed": "The model is unavailable: {reason}.",
    "developer.ai_ping_timeout": "The model is unavailable: 20-second timeout.",
    "developer.retention_run": "Auto-deletion done: photo links removed — {photos}, files deleted — {files}.",
    "developer.retention_failed": "Auto-deletion failed — see the server logs for details.",
    "developer.ai_budget_reset": "The daily AI check budget has been reset.",
    "developer.ai_budget_reset_failed": "Could not reset the budget — see the server logs for details.",
    "developer.checks_unfrozen": "Stuck checks cleared: {count}.",
    "developer.checks_unfrozen_failed": "Could not clear stuck checks — see the server logs for details.",
    "developer.caches_flushed": "Platform caches flushed.",
    "developer.broadcast_invalid": "Fill in the title and choose recipients.",
    "developer.broadcast_sent": "Notification sent to students: {count}.",
    "progress.status": "{source}: {previousStatus} → {status}. {decision}"
  },
  verdicts: {
    correct: "correct",
    incorrect: "incorrect",
    uncertain: "unrecognised"
  },
  actors: {
    autoCheck: "AI check",
    lessonAutoFinish: "Lesson auto-finish"
  }
};

export const notificationsRu = {
  homeworkAssigned: {
    titleAssigned: "Учитель выдал ДЗ по теме «{topic}»",
    titleDeadline: "Назначен дедлайн по теме «{topic}»",
    bodyOne: "Номер {numbers} · дедлайн {deadline}",
    bodyMany: "Номера {numbers} · дедлайн {deadline}",
    fallbackTopic: "Тема"
  },
  homeworkChecked: {
    title: "Результат автопроверки готов",
    body: "Автопроверка: верно — {correct}, перерешать — {incorrect}{uncertain}. {statuses}",
    uncertainSuffix: ", нужна ручная проверка — {uncertain}",
    statusesUpdated: "Обновлено статусов: {count}.",
    statusesUnchanged: "Статусы не изменены."
  },
  parentCall: {
    titleDue: "Пора позвонить родителям",
    titleOverdue: "Звонок родителям просрочен",
    bodyReached: "{name}: последний звонок был {days} дн. назад.",
    bodyNoCalls: "{name}: успешных звонков ещё не было."
  },
  devErrors: {
    title: "Ошибки на платформе: {count} за сутки",
    body: "Загляните в журнал действий — там видно, какие вызовы упали и почему."
  },
  devBudgetOut: {
    title: "Дневной бюджет ИИ исчерпан",
    body: "Проверки и подбор остановлены до сброса окна: {used} из {limit} за 24 часа."
  },
  devBudgetWarn: {
    title: "Бюджет ИИ на исходе",
    body: "Использовано {used} из {limit} запусков за 24 часа — осталось меньше 20%."
  },
  devStaleChecks: {
    title: "Зависшие проверки: {count}",
    body: "Проверки в очереди дольше 30 минут — ученики ждут. Кнопка «Разморозить» — в действиях панели."
  },
  devStorage: {
    title: "Хранилище файлов разрослось: {gb} ГБ",
    body: "Проверьте срок хранения фото решений и запустите очистку в действиях панели."
  }
};

export const notificationsEn: typeof notificationsRu = {
  homeworkAssigned: {
    titleAssigned: "Your teacher assigned homework on “{topic}”",
    titleDeadline: "A deadline was set for “{topic}”",
    bodyOne: "Problem {numbers} · due {deadline}",
    bodyMany: "Problems {numbers} · due {deadline}",
    fallbackTopic: "Topic"
  },
  homeworkChecked: {
    title: "Your AI check result is ready",
    body: "AI check: correct — {correct}, to redo — {incorrect}{uncertain}. {statuses}",
    uncertainSuffix: ", needs manual review — {uncertain}",
    statusesUpdated: "Statuses updated: {count}.",
    statusesUnchanged: "Statuses unchanged."
  },
  parentCall: {
    titleDue: "Time to call the parents",
    titleOverdue: "Parent call is overdue",
    bodyReached: "{name}: the last call was {days} days ago.",
    bodyNoCalls: "{name}: no successful calls yet."
  },
  devErrors: {
    title: "Platform errors: {count} in the last day",
    body: "Check the activity log — it shows which calls failed and why."
  },
  devBudgetOut: {
    title: "Daily AI budget exhausted",
    body: "Checks and selection are paused until the window resets: {used} of {limit} in 24 hours."
  },
  devBudgetWarn: {
    title: "AI budget running low",
    body: "{used} of {limit} runs used in 24 hours — less than 20% left."
  },
  devStaleChecks: {
    title: "Stuck checks: {count}",
    body: "Checks have been queued for over 30 minutes — students are waiting. Use “Unfreeze” in the panel actions."
  },
  devStorage: {
    title: "File storage has grown: {gb} GB",
    body: "Review the solution photo retention period and run the cleanup in the panel actions."
  }
};
