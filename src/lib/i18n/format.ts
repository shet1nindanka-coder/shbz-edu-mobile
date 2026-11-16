import type { Locale } from "@/lib/i18n/locale";

// Без словарей: модуль подключается и в client-компонентах.

/** Подстановка {имя} → значение. Неизвестные плейсхолдеры остаются как есть. */
export function format(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}

/**
 * Форма слова по числу. Русский — три формы (1 минута / 2 минуты / 5 минут),
 * английский — две (1 minute / 2 minutes). Формы содержат {n}.
 */
export function plural(locale: Locale, count: number, forms: readonly string[]) {
  const n = Math.abs(Math.trunc(count));
  let form: string | undefined;

  if (locale === "ru") {
    const mod10 = n % 10;
    const mod100 = n % 100;

    if (mod10 === 1 && mod100 !== 11) {
      form = forms[0];
    } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      form = forms[1];
    } else {
      form = forms[2] ?? forms[1];
    }
  } else {
    form = n === 1 ? forms[0] : (forms[1] ?? forms[0]);
  }

  return format(form ?? forms[0] ?? "", { n: count });
}
