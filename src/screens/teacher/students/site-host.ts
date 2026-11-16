/**
 * Host shown on the «Сайт» line of the credentials sheet. The site prints `window.location.host`; the app
 * has no page address of its own.
 */
// SPEC-GAP: docs/spec/04-teacher-students.md §7 item 7 leaves the source of the host open ("must come from
// app config"), and neither `GET /meta` nor app.json carries one. The site's own default public address
// (`PUBLIC_SITE_URL` in its .env.example) is used until the server delivers it.
export const SITE_HOST = 'shbz-edu.ru';
