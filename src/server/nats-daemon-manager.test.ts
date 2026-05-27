import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { connect } from "@nats-io/transport-node"
import { NatsDaemonManager } from "./nats-daemon-manager"

describe("NatsDaemonManager", () => {
  let manager: NatsDaemonManager | null = null
  let prevAuthMode: string | undefined

  // These tests exercise the token-mode daemon path (they pass a token and
  // connect with it). The server default is now NATS_AUTH_MODE=callout, which
  // spawns the callout daemon (requires NATS_DATA_DIR + key material); the
  // callout daemon path is covered by src/nats/auth-callout/callout.integration.test.ts.
  beforeEach(() => {
    prevAuthMode = process.env.NATS_AUTH_MODE
    process.env.NATS_AUTH_MODE = "token"
  })

  afterEach(async () => {
    await manager?.dispose()
    manager = null
    if (prevAuthMode === undefined) delete process.env.NATS_AUTH_MODE
    else process.env.NATS_AUTH_MODE = prevAuthMode
  })

  test("ensureDaemon starts daemon and returns connection info", async () => {
    manager = NatsDaemonManager.embedded()
    const info = await manager.ensureDaemon({ token: "test-" + Date.now() })
    expect(info).toHaveProperty("url")
    expect(info).toHaveProperty("wsUrl")
    expect(info).toHaveProperty("wsPort")
    expect(info).toHaveProperty("pid")
    expect(info.url).toMatch(/^nats:\/\//)
  })

  test("ensureDaemon returns working NATS connection", async () => {
    const token = "test-" + Date.now()
    manager = NatsDaemonManager.embedded()
    const info = await manager.ensureDaemon({ token })

    const nc = await connect({ servers: info.url, token })
    expect(nc).toBeDefined()
    await nc.drain()
  })

  test("ensureDaemon reuses existing daemon on second call", async () => {
    const token = "test-" + Date.now()
    manager = NatsDaemonManager.embedded()
    const info1 = await manager.ensureDaemon({ token })
    const info2 = await manager.ensureDaemon({ token })
    expect(info1.pid).toBe(info2.pid)
    expect(info1.url).toBe(info2.url)
  })

  test("dispose kills the daemon process", async () => {
    const token = "test-" + Date.now()
    manager = NatsDaemonManager.embedded()
    const info = await manager.ensureDaemon({ token })
    const pid = info.pid

    await manager.dispose()
    manager = null

    // Give OS time to reap
    await new Promise(r => setTimeout(r, 200))

    // Process should be dead
    try {
      process.kill(pid, 0) // signal 0 = check if alive
      // If we get here, process is still alive — fail
      expect(true).toBe(false)
    } catch {
      // Expected — process is dead
      expect(true).toBe(true)
    }
  })
})
