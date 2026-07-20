import { beforeEach, describe, expect, it, vi } from "vitest"

// The worker wiring is pure plumbing: which queue name gets a handler, and which
// queues get a cron schedule. A typo when renaming a queue constant would leave
// enqueue and worker pointing at different queues — jobs would sit in "created"
// forever and nothing would fail loudly. pg-boss is stubbed so both sides can be
// asserted without a database.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/env", () => ({ env: { DATABASE_URL: "postgres://test/test" } }))

const workMock = vi.fn()
const scheduleMock = vi.fn()
const createQueueMock = vi.fn()
const startMock = vi.fn()
const onMock = vi.fn()

const bossStub = {
  on: onMock,
  start: startMock,
  createQueue: createQueueMock,
  schedule: scheduleMock,
  work: workMock,
}

vi.mock("pg-boss", () => ({
  // A class, not vi.fn(() => …): the module calls `new PgBoss(...)`, and
  // clearAllMocks between tests would drop a mocked implementation anyway.
  PgBoss: class {
    constructor() {
      return bossStub
    }
  },
}))

import * as jobs from "./index"

type Boss = Parameters<typeof jobs.registerWorkers>[0]

/** Every exported queue constant — derived from the module so a renamed or
 *  newly added queue shows up here instead of in a duplicated string list. */
const ALL_QUEUES = Object.entries(jobs)
  .filter(([name, value]) => name.startsWith("QUEUE_") && typeof value === "string")
  .map(([, value]) => value as string)

const CRON_SCHEDULES: Array<[string, string]> = [
  [jobs.QUEUE_SEND_REMINDERS, "*/5 * * * *"],
  [jobs.QUEUE_POLL_BATCHES, "*/5 * * * *"],
  [jobs.QUEUE_DAILY_PLAN, "0 7 * * *"],
  [jobs.QUEUE_CHECK_UPDATES, "0 6 * * *"],
]

describe("queue constants", () => {
  it("exports a unique name for every queue", () => {
    expect(ALL_QUEUES.length).toBeGreaterThan(0)
    expect(new Set(ALL_QUEUES).size).toBe(ALL_QUEUES.length)
  })
})

describe("registerWorkers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("registers exactly one handler per exported queue constant", async () => {
    await jobs.registerWorkers(bossStub as unknown as Boss)

    const registered = workMock.mock.calls.map((call) => call[0] as string)
    expect(registered.sort()).toEqual([...ALL_QUEUES].sort())
    expect(registered).toHaveLength(ALL_QUEUES.length)
  })

  it("passes a callable handler for every queue", async () => {
    await jobs.registerWorkers(bossStub as unknown as Boss)

    for (const call of workMock.mock.calls) {
      expect(typeof call[1]).toBe("function")
    }
  })
})

describe("startClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CRON_TZ
  })

  it("creates every queue before scheduling", async () => {
    await jobs.startClient()

    const created = createQueueMock.mock.calls.map((call) => call[0] as string)
    expect(created.sort()).toEqual([...ALL_QUEUES].sort())
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it("schedules the cron queues with the expected expressions", async () => {
    await jobs.startClient()

    const scheduled = scheduleMock.mock.calls.map(
      (call) => [call[0], call[1]] as [string, string]
    )
    expect(scheduled).toEqual(CRON_SCHEDULES)
  })

  it("only schedules queues that are meant to run on a cron", async () => {
    await jobs.startClient()

    const cronQueues = CRON_SCHEDULES.map(([queue]) => queue)
    for (const queue of ALL_QUEUES) {
      const isScheduled = scheduleMock.mock.calls.some((call) => call[0] === queue)
      expect(isScheduled).toBe(cronQueues.includes(queue))
    }
  })

  it("defaults the cron timezone to UTC", async () => {
    await jobs.startClient()

    for (const call of scheduleMock.mock.calls) {
      expect(call[3]).toEqual({ tz: "UTC" })
    }
  })

  it("uses CRON_TZ as the schedule timezone when it is set", async () => {
    process.env.CRON_TZ = "Europe/Berlin"

    await jobs.startClient()

    expect(scheduleMock.mock.calls.length).toBe(CRON_SCHEDULES.length)
    for (const call of scheduleMock.mock.calls) {
      expect(call[3]).toEqual({ tz: "Europe/Berlin" })
    }
  })

  it("registers an error listener instead of letting pg-boss emit unhandled errors", async () => {
    await jobs.startClient()

    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function))
  })
})
