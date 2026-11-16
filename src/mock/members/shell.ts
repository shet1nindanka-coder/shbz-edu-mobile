/**
 * `ShellApi` on the mock store: session, profile, notifications, streak, number search, realtime
 * (docs/spec/01-shell-auth.md §3 – §5; 00 §2.1 – §2.4; 90-addendum-6 §7 – §8).
 */
import type { ShellApi } from "@/api/client";
import type { ApiError } from "@/api/errors";
import type { RateLimitScope } from "@/api/types";
import { LIMITS, META_LIMITS, RATE_LIMITS, SERVER_TIME_ZONE } from "@/api/types";
import { normalizeUserName, validateLoginInput, validatePasswordChangeInput } from "@/domain/account-validation";
import { normalizeHomeworkNumber } from "@/domain/numbers";
import { computeStudentStreak } from "@/domain/student-streak";
import { format, plural } from "@/lib/i18n/format";

import type { MockContext } from "../context";
import { MOCK_CLIENT_IP } from "../controls";
import { retryAfterSeconds, type RateLimitResult } from "../rules/rate-limit";

export function createShell(ctx: MockContext): ShellApi {
  const { store, errors, auth, limits } = ctx;

  /** `429 rateLimited` of the login: «…через N минут», `params.minutes` 1..60, `retryAfterSeconds`. */
  const loginRateLimited = (result: RateLimitResult): ApiError => {
    const seconds = retryAfterSeconds(result);
    const minutes = Math.min(60, Math.max(1, Math.ceil(seconds / 60)));
    const texts = ctx.dict().login;
    return errors.make({
      status: 429,
      code: "rateLimited",
      message: format(texts.rateLimitedFor, { minutes: plural(ctx.locale(), minutes, texts.minuteForms) }),
      params: { minutes },
      retryAfterSeconds: seconds,
    });
  };

  const consumeLoginLimit = (scope: "login:ip" | "login:ip-login" | "login:login", identifier: string): void => {
    const rule = RATE_LIMITS[scope];
    const windowMs = rule.windowSeconds * 1000;
    const result =
      rule.window === "sliding"
        ? limits.consumeSliding(scope, identifier, rule.limit, windowMs)
        : limits.consumeFixed(scope, identifier, rule.limit, windowMs);
    if (!result.allowed) throw loginRateLimited(result);
  };

  return {
    async getMeta() {
      return {
        serverNow: ctx.nowIso(),
        timeZone: SERVER_TIME_ZONE,
        locales: ["ru", "en"],
        loginHelpContact: ctx.settings().loginHelpContact,
        limits: META_LIMITS,
      };
    },

    async login(input) {
      // 1. Shape. Consumes no limiter slot.
      const parsed = validateLoginInput(String(input?.login ?? ""), String(input?.password ?? ""));
      if (!parsed.ok) return errors.fail({ status: 400, code: "empty", message: (dict) => dict.login.errors.empty });
      const { login, password } = parsed;

      // 2–3. The three limiters run BEFORE the credentials are checked: a refused attempt is refused even
      // with the correct password and for a login that does not exist. The device plays the client address.
      consumeLoginLimit("login:ip", MOCK_CLIENT_IP);
      consumeLoginLimit("login:ip-login", `${MOCK_CLIENT_IP}:${login}`);
      consumeLoginLimit("login:login", login);

      // 4–5. Credentials. Demo accounts only: the mock compares plain text.
      const user = store.users.findUnique("email", login);
      if (!user || user.password !== password) {
        ctx.audit.write({ category: "AUTH", action: "auth.login", outcome: "failed", text: { key: "auth.login.failed", params: { login } } });
        return errors.fail({ status: 401, code: "invalidCredentials", message: (dict) => dict.login.errors.invalid });
      }

      // 6. Success resets the per-login buckets (not the per-address one) and creates a session.
      limits.reset("login:ip-login", `${MOCK_CLIENT_IP}:${login}`);
      limits.reset("login:login", login);
      auth.purgeExpiredSessions();
      const session = auth.createSession(user.id);
      ctx.audit.write({ category: "AUTH", action: "auth.login", actor: user, text: { key: "auth.login" } });

      return { token: session.token, expiresAt: session.expiresAt, user: auth.toAuthenticatedUser(user) };
    },

    async logout() {
      const user = auth.requireUser();
      const token = auth.token();
      if (token) auth.deleteSession(token);
      ctx.audit.write({ category: "AUTH", action: "auth.logout", actor: user, text: { key: "auth.logout" } });
      // The stream of the signed-out user closes and frees its slot.
      ctx.realtime.sessionChanged();
    },

    async getMe() {
      const info = auth.session();
      if (!info) throw errors.sessionExpired();
      return { user: auth.toAuthenticatedUser(info.user), sessionExpiresAt: info.session.expiresAt };
    },

    async updateProfile(input) {
      const user = auth.requireUser();
      const name = normalizeUserName(String(input?.name ?? ""));
      if (name === null) return errors.fail({ status: 400, code: "infoInvalid", message: (dict) => dict.settings.notices.infoInvalid });
      const updated = store.users.update(user.id, { name, updatedAt: ctx.nowIso() });
      return { user: auth.toAuthenticatedUser(updated) };
    },

    async changePassword(input) {
      const user = auth.requireUser();
      const parsed = validatePasswordChangeInput({
        currentPassword: String(input?.currentPassword ?? ""),
        newPassword: String(input?.newPassword ?? ""),
        confirmPassword: String(input?.confirmPassword ?? ""),
      });
      if (!parsed.ok) {
        if (parsed.error === "mismatch") {
          return errors.fail({ status: 400, code: "passwordMismatch", message: (dict) => dict.settings.notices.passwordMismatch });
        }
        return errors.fail({
          status: 400,
          code: "passwordInvalid",
          message: (dict) => dict.settings.notices.passwordInvalid,
          ...(parsed.passwordProblem ? { details: { problem: parsed.passwordProblem } } : {}),
        });
      }

      // Consumed only by attempts that passed validation, BEFORE the current password is verified: a wrong
      // current password and a successful change both burn a slot, and nothing resets the bucket.
      const rule = RATE_LIMITS["profile:password-update"];
      const limit = limits.consumeFixed("profile:password-update", user.id, rule.limit, rule.windowSeconds * 1000);
      if (!limit.allowed) {
        throw errors.rateLimited(retryAfterSeconds(limit), (dict) => dict.settings.notices.passwordRateLimited);
      }

      if (user.password !== parsed.currentPassword) {
        return errors.fail({ status: 403, code: "passwordCurrent", message: (dict) => dict.settings.notices.passwordCurrent });
      }

      // One transaction: new password, every session of the user deleted, one new session for this device.
      const session = store.transaction(() => {
        store.users.update(user.id, { password: parsed.newPassword, updatedAt: ctx.nowIso() });
        auth.deleteSessionsOfUser(user.id);
        return auth.createSession(user.id);
      });
      // The old token is gone: the stream closes until the client installs the rotated token.
      ctx.realtime.sessionChanged();

      return { token: session.token, expiresAt: session.expiresAt };
    },

    async listNotifications() {
      const user = auth.requireUser();
      limits.enforce("api:notifications");
      // Lazy generation before listing; throttled inside.
      if (user.role === "TEACHER") ctx.notify.ensureParentCallReminders(user.id);
      if (user.role === "DEVELOPER") ctx.notify.ensureDeveloperAlerts(user.id);
      return ctx.notify.list(user.id, user.role);
    },

    async markNotificationsRead(input) {
      const user = auth.requireUser();
      limits.enforce("api:notifications");
      // Only a string id is honoured; anything else means "all".
      const notificationId = typeof input?.notificationId === "string" && input.notificationId ? input.notificationId : undefined;
      return { unreadCount: ctx.notify.markRead(user.id, notificationId) };
    },

    async getStreak() {
      const user = auth.requireStudent();
      limits.enforce("api:streak");
      return { streak: computeStudentStreak(ctx.q.timelineRows(user.id), ctx.now(), ctx.locale()) };
    },

    async findNumber(number) {
      const user = auth.requireUser();
      const isStudent = user.role === "STUDENT";
      const scope: RateLimitScope = isStudent ? "api:student-find-number" : "api:find-number";
      limits.enforce(scope);

      const digits = ctx.validate.digits(number, LIMITS.numberSearchMaxDigits);
      if (digits === null || normalizeHomeworkNumber(digits) === "0") {
        return errors.fail({
          status: 400,
          code: "invalidNumber",
          message: (dict) => (isStudent ? dict.apiStudent.findNumber.invalidNumber : dict.apiContent.findNumber.invalidNumber),
        });
      }

      const found = ctx.q.findNumberByLabel(digits);
      const topic = found ? ctx.q.topic(found.topicId) : undefined;
      if (!found || !topic) {
        throw errors.notFound("numberNotFound", (dict) => (isStudent ? dict.apiStudent.findNumber.notFound : dict.apiCommon.numberNotFound));
      }
      // The recorded spelling (leading zeros kept), one shape for every role.
      return { number: found.number, topicId: topic.id, topicTitle: topic.title };
    },

    subscribeRealtime(listener, options) {
      return ctx.realtime.subscribe(listener, options);
    },
  };
}
