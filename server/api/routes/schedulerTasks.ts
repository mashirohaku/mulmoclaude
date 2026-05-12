// API routes for the unified scheduler (#357).
//
//   GET    /api/scheduler/tasks        — all registered tasks + state
//   POST   /api/scheduler/tasks        — create user task
//   PUT    /api/scheduler/tasks/:id    — update user task
//   DELETE /api/scheduler/tasks/:id    — delete user task
//   POST   /api/scheduler/tasks/:id/run — manual trigger
//   GET    /api/scheduler/logs         — execution log (newest first)

import { Router, type Request, type Response } from "express";
import { getSchedulerTasks, getSchedulerLogs } from "../../events/scheduler-adapter.js";
import type { TaskLogEntry } from "@receptron/task-scheduler";
import { API_ROUTES } from "../../../src/config/apiRoutes.js";
import { bindRoute } from "../../utils/router.js";
import { SESSION_ORIGINS } from "../../../src/types/session.js";
import { loadUserTasks, validateAndCreate, applyUpdate, withUserTaskLock } from "../../workspace/skills/user-tasks.js";
import { badRequest, notFound } from "../../utils/httpError.js";
import { errorMessage } from "../../utils/errors.js";
import { getOptionalStringQuery } from "../../utils/request.js";
import { log } from "../../system/logger/index.js";
import { startChat } from "./agent.js";
import { makeUuid } from "../../utils/id.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// ── List all tasks ──────────────────────────────────────────────

bindRoute(
  router,
  API_ROUTES.scheduler.tasksList,
  asyncHandler("scheduler-tasks", "Failed to list tasks", async (_req, res) => {
    log.info("scheduler-tasks", "list: start");
    // getSchedulerTasks() returns system-only tasks (registered via
    // initScheduler at startup — journal, chat-index, sources, etc.).
    // origin: "system" is correct, not an overwrite — these tasks
    // have no origin field of their own.
    const systemTasks = getSchedulerTasks();
    const userTasks = loadUserTasks();
    const all = [...systemTasks.map((task) => ({ ...task, origin: "system" as const })), ...userTasks.map((task) => ({ ...task, origin: "user" as const }))];
    log.info("scheduler-tasks", "list: ok", { system: systemTasks.length, user: userTasks.length });
    res.json({ tasks: all });
  }),
);

// ── Create user task ────────────────────────────────────────────

bindRoute(
  router,
  API_ROUTES.scheduler.tasksCreate,
  asyncHandler("scheduler-tasks", "Failed to create task", async (req, res) => {
    log.info("scheduler-tasks", "create: start");
    const validated = validateAndCreate(req.body);
    if (validated.kind === "error") {
      log.warn("scheduler-tasks", "create: validation failed", { error: validated.error });
      badRequest(res, validated.error);
      return;
    }
    const task = await withUserTaskLock(async (tasks) => ({
      tasks: [...tasks, validated.task],
      result: validated.task,
    }));
    log.info("scheduler-tasks", "create: ok", { id: task.id, name: task.name });
    res.status(201).json({ task });
  }),
);

// ── Update user task ────────────────────────────────────────────

bindRoute(
  router,
  API_ROUTES.scheduler.taskUpdate,
  asyncHandler<Request<{ id: string }>, Response>("scheduler-tasks", "Failed to update task", async (req, res) => {
    const { id: taskId } = req.params;
    log.info("scheduler-tasks", "update: start", { taskId });
    try {
      const updated = await withUserTaskLock(async (tasks) => {
        const result = applyUpdate(tasks, taskId, req.body);
        if (result.kind === "error") {
          throw new Error(result.error);
        }
        const task = result.tasks.find((taskItem) => taskItem.id === taskId);
        return { tasks: result.tasks, result: task };
      });
      log.info("scheduler-tasks", "update: ok", { taskId });
      res.json({ task: updated });
    } catch (err) {
      // Domain-shaped errors → 404; everything else rethrows for the
      // asyncHandler wrapper to surface as 500.
      const msg = errorMessage(err);
      if (msg.startsWith("task not found") || msg.startsWith("request body")) {
        log.warn("scheduler-tasks", "update: validation failed", { taskId, reason: msg });
        notFound(res, msg);
        return;
      }
      throw err;
    }
  }),
);

// ── Delete user task ────────────────────────────────────────────

bindRoute(
  router,
  API_ROUTES.scheduler.taskDelete,
  asyncHandler<Request<{ id: string }>, Response>("scheduler-tasks", "Failed to delete task", async (req, res) => {
    const { id: taskId } = req.params;
    log.info("scheduler-tasks", "delete: start", { taskId });
    try {
      await withUserTaskLock(async (tasks) => {
        const index = tasks.findIndex((task) => task.id === taskId);
        if (index === -1) throw new Error(`task not found: ${taskId}`);
        const next = tasks.filter((task) => task.id !== taskId);
        return { tasks: next, result: undefined };
      });
      log.info("scheduler-tasks", "delete: ok", { taskId });
      res.json({ deleted: taskId });
    } catch (err) {
      const msg = errorMessage(err);
      if (msg.startsWith("task not found")) {
        log.warn("scheduler-tasks", "delete: not found", { taskId });
        notFound(res, msg);
        return;
      }
      throw err;
    }
  }),
);

// ── Manual trigger ──────────────────────────────────────────────

bindRoute(router, API_ROUTES.scheduler.taskRun, async (req: Request<{ id: string }>, res: Response) => {
  const { id: taskId } = req.params;
  log.info("scheduler-tasks", "run: start", { taskId });
  // Check user tasks first
  const userTasks = loadUserTasks();
  const userTask = userTasks.find((task) => task.id === taskId);
  if (userTask) {
    const chatSessionId = makeUuid();
    log.info("scheduler-tasks", "run: user task triggered", {
      taskId,
      name: userTask.name,
      chatSessionId,
    });
    startChat({
      message: userTask.prompt,
      roleId: userTask.roleId,
      chatSessionId,
      origin: SESSION_ORIGINS.scheduler,
    }).catch((err) => {
      log.error("scheduler-tasks", "run: startChat failed", {
        taskId,
        error: String(err),
      });
    });
    res.json({ triggered: taskId, chatSessionId });
    return;
  }
  // Not a user task — check system/skill tasks
  const systemTasks = getSchedulerTasks();
  const found = systemTasks.find((task) => task.id === taskId);
  if (!found) {
    log.warn("scheduler-tasks", "run: not found", { taskId });
    notFound(res, `task not found: ${taskId}`);
    return;
  }
  // System tasks don't have a prompt to startChat with — return 400
  log.warn("scheduler-tasks", "run: refused (system task)", { taskId });
  badRequest(res, "manual run is only supported for user tasks");
});

// ── Execution logs ──────────────────────────────────────────────

interface LogQuery {
  since?: string;
  taskId?: string;
  limit?: string;
}

bindRoute(
  router,
  API_ROUTES.scheduler.logs,
  asyncHandler<Request<object, unknown, object, LogQuery>, Response<{ logs: TaskLogEntry[] }>>(
    "scheduler-tasks",
    "Failed to read scheduler logs",
    async (req, res) => {
      const MAX_LIMIT = 500;
      const rawLimitStr = getOptionalStringQuery(req, "limit");
      const rawLimit = rawLimitStr ? parseInt(rawLimitStr, 10) : undefined;
      const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : undefined;
      const taskId = getOptionalStringQuery(req, "taskId");
      log.info("scheduler-tasks", "logs: start", { taskId, limit });
      const logs = await getSchedulerLogs({
        since: getOptionalStringQuery(req, "since"),
        taskId,
        limit,
      });
      log.info("scheduler-tasks", "logs: ok", { entries: logs.length, taskId });
      res.json({ logs });
    },
  ),
);

export default router;
