import { LOG_PREFIX } from "../shared/branding"

export interface NatsDaemonInfo {
  url: string
  wsUrl: string
  wsPort: number
  pid: number
}

export interface NatsDaemonReadiness extends NatsDaemonInfo {
  ok: boolean
}

export class NatsDaemonManager {
  private daemonProcess: ReturnType<typeof Bun.spawn> | null = null
  private info: NatsDaemonInfo | null = null
  private readonly external: boolean

  private constructor(external: boolean) {
    this.external = external
  }

  /** Create a manager that spawns and owns the NATS daemon process. */
  static embedded(): NatsDaemonManager {
    return new NatsDaemonManager(false)
  }

  /** Create a manager that connects to an externally-managed NATS daemon (e.g. separate systemd unit). */
  static fromExternal(opts: { natsUrl: string; wsPort: number }): NatsDaemonManager {
    const mgr = new NatsDaemonManager(true)
    const url = new URL(opts.natsUrl)
    mgr.info = {
      url: opts.natsUrl,
      wsUrl: `ws://${url.hostname}:${opts.wsPort}`,
      wsPort: opts.wsPort,
      pid: 0, // external — no PID to track
    }
    console.warn(LOG_PREFIX, `Connected to external NATS — url: ${opts.natsUrl}, ws: ${opts.wsPort}`)
    return mgr
  }

  async ensureDaemon(options: {
    token: string
    host?: string
  }): Promise<NatsDaemonInfo> {
    if (this.external && this.info) return this.info

    // Reuse if already running and alive
    if (this.info && this.daemonProcess) {
      try {
        process.kill(this.info.pid, 0) // check alive
        return this.info
      } catch {
        // Process died, restart
        this.daemonProcess = null
        this.info = null
      }
    }

    const authMode = process.env.NATS_AUTH_MODE ?? "callout"
    const isCallout = authMode === "callout"

    const daemonScript = isCallout
      ? new URL("../nats/nats-daemon-callout.ts", import.meta.url).pathname
      : new URL("../nats/nats-daemon.ts", import.meta.url).pathname

    const {
      NATS_DATA_DIR: natsDataDir,
      NATS_URL: _natsUrl,
      NATS_MODE: _natsMode,
      NATS_WS_PORT: _natsWsPort,
      NATS_PORT: _natsPort,
      NATS_STORE_DIR: _natsStoreDir,
      NATS_HTTP_PORT: _natsHttpPort,
      ...spawnEnv
    } = process.env

    const child = Bun.spawn(["bun", "run", daemonScript], {
      env: {
        ...spawnEnv,
        // In callout mode the daemon reads the token secret from disk; NATS_TOKEN
        // is unused by the callout child but harmless to pass. In token mode it
        // is the shared auth token.
        NATS_TOKEN: options.token,
        ...(options.host ? { NATS_HOST: options.host } : {}),
        // Callout mode: pass NATS_DATA_DIR so the child can load keys + secret.
        // Token mode: strip it (was previous behaviour, preserve for compat).
        ...(isCallout && natsDataDir ? { NATS_DATA_DIR: natsDataDir } : {}),
      },
      stdio: ["ignore", "pipe", "inherit"],
    })

    // Read JSON info from stdout
    const reader = child.stdout.getReader()
    const { value } = await reader.read()
    if (!value) {
      child.kill("SIGTERM")
      throw new Error("NATS daemon produced no output")
    }

    const text = new TextDecoder().decode(value).trim()
    let info: NatsDaemonInfo
    try {
      info = JSON.parse(text) as NatsDaemonInfo
    } catch (error) {
      child.kill("SIGTERM")
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse NATS daemon output: ${message}`)
    }

    this.daemonProcess = child
    this.info = info

    console.warn(LOG_PREFIX, `NATS daemon started — pid: ${info.pid}, url: ${info.url}`)

    return info
  }

  getReadiness(): NatsDaemonReadiness | null {
    if (!this.info) return null
    if (this.external) {
      // External daemon: no PID to check — rely on NATS connection health instead
      return { ...this.info, ok: true }
    }
    let ok = false
    try {
      process.kill(this.info.pid, 0)
      ok = true
    } catch {
      ok = false
    }
    return {
      ...this.info,
      ok,
    }
  }

  async dispose(): Promise<void> {
    if (this.external) return // don't kill external daemon
    if (this.daemonProcess) {
      this.daemonProcess.kill("SIGTERM")
      await this.daemonProcess.exited
      this.daemonProcess = null
      this.info = null
      console.warn(LOG_PREFIX, "NATS daemon stopped")
    }
  }
}
