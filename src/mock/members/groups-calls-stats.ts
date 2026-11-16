/**
 * `GroupsCallsStatsApi` on the mock store — 06 — groups, attendance, parent calls, statistics (docs/spec/06-teacher-groups-calls-stats.md; 00 §2.11).
 *
 * NOT IMPLEMENTED YET: every method rejects with `ApiError { code: "internalError" }`. The owner of this
 * member replaces the bodies below using `ctx` (see `../context.ts` for the helpers and the shape of a
 * typical method) and does not need to touch any other file of `src/mock`.
 */
import type { GroupsCallsStatsApi } from "@/api/client";

import type { MockContext } from "../context";
import { notImplemented } from "./not-implemented";

// `ctx` is unused until the methods are implemented.
export function createGroupsCallsStats(ctx: MockContext): GroupsCallsStatsApi {
  return {
    async listGroups() {
      return notImplemented("groups.listGroups");
    },
    async createGroup() {
      return notImplemented("groups.createGroup");
    },
    async getGroup() {
      return notImplemented("groups.getGroup");
    },
    async renameGroup() {
      return notImplemented("groups.renameGroup");
    },
    async deleteGroup() {
      return notImplemented("groups.deleteGroup");
    },
    async addGroupMember() {
      return notImplemented("groups.addGroupMember");
    },
    async removeGroupMember() {
      return notImplemented("groups.removeGroupMember");
    },
    async setStudentAiProfile() {
      return notImplemented("groups.setStudentAiProfile");
    },
    async getGroupStatistics() {
      return notImplemented("groups.getGroupStatistics");
    },
    async getGroupAttendance() {
      return notImplemented("groups.getGroupAttendance");
    },
    async setAttendance() {
      return notImplemented("groups.setAttendance");
    },
    async downloadGroupAttendancePdf() {
      return notImplemented("groups.downloadGroupAttendancePdf");
    },
    async getParentCallsOverview() {
      return notImplemented("groups.getParentCallsOverview");
    },
    async getParentCallCounts() {
      return notImplemented("groups.getParentCallCounts");
    },
    async getParentCallHistory() {
      return notImplemented("groups.getParentCallHistory");
    },
    async recordParentCall() {
      return notImplemented("groups.recordParentCall");
    },
    async getStatisticsProgress() {
      return notImplemented("groups.getStatisticsProgress");
    },
    async getStatisticsDrilldown() {
      return notImplemented("groups.getStatisticsDrilldown");
    },
    async getStatisticsTeachers() {
      return notImplemented("groups.getStatisticsTeachers");
    },
    async getStatisticsPlatform() {
      return notImplemented("groups.getStatisticsPlatform");
    },
  };
}
