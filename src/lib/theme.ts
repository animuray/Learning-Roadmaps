/** Тема оформления. "system" — как в настройках ОС; выбор хранится в cookie, чтобы сервер сразу отдал нужную тему. */
export type Theme = "system" | "light" | "dark";

export const THEME_COOKIE = "theme";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
