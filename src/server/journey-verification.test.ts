import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { createServer } from "node:net"
import { APP_NAME, getDataDir } from "../shared/branding"
import {
  buildStageProbeScript,
  getJourneyStage,
  HOME_TO_FORK_DIALOG_JOURNEY,
  HOME_TO_MERGE_DIALOG_JOURNEY,
  HOME_TO_NEW_CHAT_JOURNEY,
  matchesJourneyRoute,
  type StageProbeResult,
} from "./journey-verification"

interface AgentBrowserEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
}

interface AgentBrowserEvalResult<T> {
  origin: string
  result: T
}

interface AgentBrowserUrlResult {
  url: string
}

interface RunningDevServer {
  clientPort: number
  serverPort: number
  process: Bun.Subprocess<"ignore", "pipe", "pipe">
  stdoutText: Promise<string>
  stderrText: Promise<string>
}

interface FixtureEnvironment {
  homeDir: string
  fixtureProjectDir: string
  fixtureProjectTitle: string
  dataDir: string
}

const activeServers: RunningDevServer[] = []
const activeHomes: string[] = []
const activeAgentBrowserSessions = new Set<string>()

function getAgentBrowserEnv(session: string): Record<string, string> {
  return {
    ...process.env,
    AGENT_BROWSER_SESSION: session,
    AGENT_BROWSER_DEFAULT_TIMEOUT: "15000",
  } as Record<string, string>
}

function decodeBytes(bytes: Uint8Array<ArrayBufferLike>) {
  return new TextDecoder().decode(bytes)
}

function closeAllAgentBrowsers() {
  Bun.spawnSync(["agent-browser", "close", "--all"], {
    env: process.env,
    stdout: "ignore",
    stderr: "ignore",
  })
}

function runAgentBrowserJson<T>(session: string, args: string[]): T {
  const result = Bun.spawnSync(["agent-browser", "--json", ...args], {
    env: getAgentBrowserEnv(session),
    stdout: "pipe",
    stderr: "pipe",
  })

  const stdout = decodeBytes(result.stdout)
  const stderr = decodeBytes(result.stderr)
  let parsed: AgentBrowserEnvelope<T> | null = null

  if (stdout.trim()) {
    parsed = JSON.parse(stdout) as AgentBrowserEnvelope<T>
  }

  if (result.exitCode !== 0 || !parsed?.success || parsed.data === null) {
    const details = [
      `agent-browser ${args.join(" ")} failed`,
      parsed?.error ? `error: ${parsed.error}` : null,
      stderr.trim() ? `stderr: ${stderr.trim()}` : null,
      stdout.trim() ? `stdout: ${stdout.trim()}` : null,
    ].filter(Boolean).join("\n")
    throw new Error(details)
  }

  return parsed.data
}

async function readStream(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return ""
  return await new Response(stream).text()
}

async function isPortAvailable(port: number) {
  return await new Promise<boolean>((resolve) => {
    const server = createServer()

    server.once("error", () => {
      resolve(false)
    })

    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePortPair() {
  const basePort = 5600 + Math.floor(Math.random() * 200) * 2

  for (let offset = 0; offset < 400; offset += 2) {
    const clientPort = basePort + offset
    const serverPort = clientPort + 1

    if (await isPortAvailable(clientPort) && await isPortAvailable(serverPort)) {
      return { clientPort, serverPort }
    }
  }

  throw new Error("Unable to find an available client/server port pair for the journey test")
}

async function waitFor<T>(
  label: string,
  fn: () => Promise<T | false>,
  timeoutMs = 30_000,
  pollMs = 250,
): Promise<T> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = await fn()
    if (value !== false) {
      return value
    }

    await Bun.sleep(pollMs)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function createFixtureEnvironment(): Promise<FixtureEnvironment> {
  const homeDir = await mkdtemp(path.join(tmpdir(), "tinkaria-journey-"))
  const fixtureProjectTitle = "journey-fixture"
  const fixtureProjectDir = path.join(homeDir, "workspace", fixtureProjectTitle)
  const codexDir = path.join(homeDir, ".codex")
  const configPath = path.join(codexDir, "config.toml")

  await mkdir(fixtureProjectDir, { recursive: true })
  await mkdir(codexDir, { recursive: true })
  await writeFile(path.join(fixtureProjectDir, "README.md"), "# journey fixture\n")
  await writeFile(configPath, `[projects."${fixtureProjectDir}"]\n`)

  return {
    homeDir,
    fixtureProjectDir,
    fixtureProjectTitle,
    dataDir: getDataDir(homeDir, { TINKARIA_RUNTIME_PROFILE: "dev" }),
  }
}

async function collectServerLogs(server: RunningDevServer) {
  const [stdout, stderr] = await Promise.all([server.stdoutText, server.stderrText])
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n")
}

async function stopServer(server: RunningDevServer) {
  if (server.process.exitCode === null) {
    server.process.kill("SIGTERM")
    await Promise.race([
      server.process.exited,
      Bun.sleep(2_000).then(() => {
        if (server.process.exitCode === null) {
          server.process.kill("SIGKILL")
        }
      }),
    ])
  }

  await Promise.allSettled([server.stdoutText, server.stderrText])
}

async function startIsolatedDevServer(homeDir: string, options?: { clientPort?: number }): Promise<RunningDevServer> {
  const ports = options?.clientPort === undefined
    ? await findAvailablePortPair()
    : { clientPort: options.clientPort, serverPort: options.clientPort + 1 }
  const { clientPort, serverPort } = ports
  const processEnv = {
    ...process.env,
    HOME: homeDir,
    TINKARIA_RUNTIME_PROFILE: "dev",
  }

  const proc = Bun.spawn([process.execPath, "run", "./scripts/dev.ts", "--port", String(clientPort), "--no-open", "--strict-port"], {
    cwd: process.cwd(),
    env: processEnv,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const server: RunningDevServer = {
    clientPort,
    serverPort,
    process: proc,
    stdoutText: readStream(proc.stdout),
    stderrText: readStream(proc.stderr),
  }

  try {
    await waitFor("isolated dev server readiness", async () => {
      if (proc.exitCode !== null) {
        throw new Error(`dev server exited before readiness with code ${String(proc.exitCode)}`)
      }

      try {
        const [clientResponse, healthResponse] = await Promise.all([
          fetch(`http://127.0.0.1:${clientPort}/`),
          fetch(`http://127.0.0.1:${serverPort}/health`),
        ])

        if (!clientResponse.ok || !healthResponse.ok) {
          return false
        }

        const healthBody = await healthResponse.json() as { ok?: boolean }
        return healthBody.ok === true ? true : false
      } catch {
        return false
      }
    }, 45_000)
  } catch (error) {
    await stopServer(server)
    const logs = await collectServerLogs(server)
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\n${logs}`)
  }

  activeServers.push(server)
  return server
}

function extractPathname(rawUrl: string) {
  return new URL(rawUrl).pathname
}

function getBrowserUrl(session: string) {
  return runAgentBrowserJson<AgentBrowserUrlResult>(session, ["get", "url"]).url
}

function evalBrowser<T>(session: string, script: string) {
  return runAgentBrowserJson<AgentBrowserEvalResult<T>>(session, ["eval", script]).result
}

function setBrowserOffline(session: string, offline: boolean) {
  runAgentBrowserJson<Record<string, unknown>>(session, ["set", "offline", offline ? "on" : "off"])
}

async function waitForStage(session: string, stageId: string) {
  const stage = getJourneyStage(stageId)
  return await waitFor(`browser stage ${stageId}`, async () => {
    const url = getBrowserUrl(session)
    if (!matchesJourneyRoute(extractPathname(url), stage.route)) {
      return false
    }

    const probe = evalBrowser<StageProbeResult>(session, buildStageProbeScript(stage))
    if (probe.missing.length > 0) {
      return false
    }

    return { url, probe }
  }, 30_000)
}

async function readJsonLines(filePath: string) {
  try {
    const text = await readFile(filePath, "utf8")
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
  } catch (error) {
    const errorCode = error instanceof Error && "code" in error ? error.code : null
    if (errorCode === "ENOENT") {
      return []
    }
    throw error
  }
}

async function openNewChatFromHomepage(session: string, fixture: FixtureEnvironment) {
  const homeStage = await waitForStage(session, "home.ready")
  expect(homeStage.probe.missing).toEqual([])
  expect(homeStage.probe.c3ByUiId["home.page"]).toBe("c3-117")

  const overviewDetails = evalBrowser<{
    containsTitle: boolean
    containsPath: boolean
    startButtonLabel: string | null
  }>(session, `(() => {
    const overview = document.querySelector('[data-ui-id="home.project-overview"]');
    const startButton = overview?.querySelector('[data-ui-id="home.project-secondary.action"]');
    const text = overview?.textContent ?? "";
    return {
      containsTitle: text.includes(${JSON.stringify(fixture.fixtureProjectTitle)}),
      containsPath: text.includes(${JSON.stringify(fixture.fixtureProjectDir)}),
      startButtonLabel: startButton?.textContent ? startButton.textContent.trim() : null,
    };
  })()`)
  expect(overviewDetails).toEqual({
    containsTitle: true,
    containsPath: false,
    startButtonLabel: "Start First Task",
  })

  const clickResult = evalBrowser<{ clicked: boolean; label: string | null }>(session, `(() => {
    const button = document.querySelector('[data-ui-id="home.project-overview"] [data-ui-id="home.project-secondary.action"]');
    if (!(button instanceof HTMLElement)) {
      return { clicked: false, label: null };
    }
    const label = button.textContent ? button.textContent.trim() : null;
    button.click();
    return { clicked: true, label };
  })()`)
  expect(clickResult).toEqual({ clicked: true, label: "Start First Task" })

  const chatStage = await waitForStage(session, "chat.ready")
  expect(chatStage.probe.missing).toEqual([])
  expect(chatStage.probe.c3ByUiId["chat.page"]).toBe("c3-110")
  expect(chatStage.probe.c3ByUiId["transcript.message-list"]).toBe("c3-111")
  expect(chatStage.probe.c3ByUiId["chat.composer"]).toBe("c3-112")

  const persistedState = await waitFor("persisted project/chat events", async () => {
    const [projectEvents, chatEvents] = await Promise.all([
      readJsonLines(path.join(fixture.dataDir, "projects.jsonl")),
      readJsonLines(path.join(fixture.dataDir, "chats.jsonl")),
    ])

    const projectOpened = projectEvents.find((event) =>
      event.type === "workspace_opened" && event.localPath === fixture.fixtureProjectDir
    )
    if (!projectOpened || typeof projectOpened.workspaceId !== "string") {
      return false
    }

    const chatCreated = chatEvents.find((event) =>
      event.type === "chat_created" && event.workspaceId === projectOpened.workspaceId && typeof event.chatId === "string"
    )
    if (!chatCreated || typeof chatCreated.chatId !== "string") {
      return false
    }

    return {
      workspaceId: projectOpened.workspaceId,
      chatId: chatCreated.chatId,
    }
  }, 10_000)

  expect(extractPathname(chatStage.url)).toBe(`/chat/${persistedState.chatId}`)
  return { chatStage, persistedState }
}

afterEach(async () => {
  for (const session of activeAgentBrowserSessions) {
    try {
      setBrowserOffline(session, false)
    } catch {
      // Best effort only; failures here should not hide the real test failure.
    }
    try {
      runAgentBrowserJson<{ closed: boolean }>(session, ["close"])
    } catch {
      // Best effort only; failures here should not hide the real test failure.
    }
  }
  activeAgentBrowserSessions.clear()

  while (activeServers.length > 0) {
    const server = activeServers.pop()
    if (server) {
      await stopServer(server)
    }
  }

  while (activeHomes.length > 0) {
    const homeDir = activeHomes.pop()
    if (homeDir) {
      await rm(homeDir, { recursive: true, force: true })
    }
  }
})

const hasAgentBrowser = Boolean(Bun.which("agent-browser"))

describe("journey verification inventory", () => {
  test("documents the first homepage -> new task journey in stable screen stages", () => {
    expect(structuredClone(HOME_TO_NEW_CHAT_JOURNEY)).toMatchObject({
      id: "homepage-to-new-chat",
      stages: [
        {
          id: "home.ready",
          owners: ["c3-117"],
          route: { kind: "exact", value: "/" },
          requiredUiIds: expect.arrayContaining(["home.page", "home.project-overview", "home.project-secondary.action"]),
        },
        {
          id: "chat.ready",
          owners: ["c3-110", "c3-111", "c3-112"],
          route: { kind: "prefix", value: "/chat/" },
          requiredUiIds: expect.arrayContaining(["chat.page", "chat.navbar", "transcript.message-list", "chat.composer"]),
        },
      ],
    })
  })

  test("documents fork and merge dialog journeys as deterministic follow-on stages", () => {
    expect(structuredClone(HOME_TO_FORK_DIALOG_JOURNEY)).toMatchObject({
      id: "homepage-to-fork-dialog",
      stages: [
        expect.anything(),
        expect.anything(),
        {
          id: "fork-dialog.open",
          owners: ["c3-110"],
          route: { kind: "prefix", value: "/chat/" },
          requiredUiIds: expect.arrayContaining([
            "chat.fork-session.dialog",
            "chat.fork-session.context.input",
            "chat.fork-session.submit.action",
          ]),
        },
      ],
    })
    expect(structuredClone(HOME_TO_MERGE_DIALOG_JOURNEY)).toMatchObject({
      id: "homepage-to-merge-dialog",
      stages: [
        expect.anything(),
        expect.anything(),
        {
          id: "merge-dialog.open",
          owners: ["c3-110"],
          route: { kind: "prefix", value: "/chat/" },
          requiredUiIds: expect.arrayContaining([
            "chat.merge-session.dialog",
            "chat.merge-session.sessions.list",
            "chat.merge-session.submit.action",
          ]),
        },
      ],
    })
  })

  describe.serial("browser integration", () => {
  test.skipIf(!hasAgentBrowser)("verifies the first browser journey against a real isolated dev instance", async () => {
    closeAllAgentBrowsers()
    const session = `journey-${crypto.randomUUID()}`
    activeAgentBrowserSessions.add(session)

    const fixture = await createFixtureEnvironment()
    activeHomes.push(fixture.homeDir)

    const server = await startIsolatedDevServer(fixture.homeDir)
    setBrowserOffline(session, false)
    runAgentBrowserJson<Record<string, unknown>>(session, ["open", `http://127.0.0.1:${server.clientPort}/`])

    await openNewChatFromHomepage(session, fixture)
  }, 90_000)

  test.skipIf(!hasAgentBrowser)("verifies fork and merge dialog journeys against a real isolated dev instance", async () => {
    closeAllAgentBrowsers()
    const session = `journey-${crypto.randomUUID()}`
    activeAgentBrowserSessions.add(session)

    const fixture = await createFixtureEnvironment()
    activeHomes.push(fixture.homeDir)

    const server = await startIsolatedDevServer(fixture.homeDir)
    setBrowserOffline(session, false)
    runAgentBrowserJson<Record<string, unknown>>(session, ["open", `http://127.0.0.1:${server.clientPort}/`])

    await openNewChatFromHomepage(session, fixture)

    evalBrowser<{ clicked: boolean }>(session, `(() => {
      const button = document.querySelector('[data-ui-id="chat.navbar.fork-session.action"]');
      if (!(button instanceof HTMLElement)) return { clicked: false };
      button.click();
      return { clicked: true };
    })()`)

    const forkStage = await waitForStage(session, "fork-dialog.open")
    expect(forkStage.probe.missing).toEqual([])
    expect(forkStage.probe.c3ByUiId["chat.fork-session.dialog"]).toBe("c3-110")

    evalBrowser<{ clicked: boolean }>(session, `(() => {
      const button = document.querySelector('[data-ui-id="chat.fork-session.cancel.action"]');
      if (!(button instanceof HTMLElement)) return { clicked: false };
      button.click();
      return { clicked: true };
    })()`)

    await waitForStage(session, "chat.ready")

    evalBrowser<{ clicked: boolean }>(session, `(() => {
      const button = document.querySelector('[data-ui-id="chat.navbar.merge-session.action"]');
      if (!(button instanceof HTMLElement)) return { clicked: false };
      button.click();
      return { clicked: true };
    })()`)

    const mergeStage = await waitForStage(session, "merge-dialog.open")
    expect(mergeStage.probe.missing).toEqual([])
    expect(mergeStage.probe.c3ByUiId["chat.merge-session.dialog"]).toBe("c3-110")
  }, 90_000)

  test.skipIf(!hasAgentBrowser)("creates a new project from the homepage modal and lands in chat", async () => {
    closeAllAgentBrowsers()
    const session = `journey-${crypto.randomUUID()}`
    activeAgentBrowserSessions.add(session)

    const fixture = await createFixtureEnvironment()
    activeHomes.push(fixture.homeDir)

    const server = await startIsolatedDevServer(fixture.homeDir)
    setBrowserOffline(session, false)
    runAgentBrowserJson<Record<string, unknown>>(session, ["open", `http://127.0.0.1:${server.clientPort}/`])

    await waitForStage(session, "home.ready")

    evalBrowser<{ clicked: boolean }>(session, `(() => {
      const button = document.querySelector('[data-ui-id="home.add-project.action"]');
      if (!(button instanceof HTMLElement)) return { clicked: false };
      button.click();
      return { clicked: true };
    })()`)

    await waitFor("add project dialog", async () => {
      const visible = evalBrowser<boolean>(session, `Boolean(document.querySelector('[data-ui-id="home.add-project.dialog"]'))`)
      return visible ? true : false
    })

    const projectName = "Coverage Project"
    const fillResult = evalBrowser<{ filled: boolean }>(session, `(() => {
      const input = document.querySelector('input[placeholder="Project name"]');
      if (!(input instanceof HTMLInputElement)) return { filled: false };
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (!valueSetter) return { filled: false };
      input.focus();
      valueSetter.call(input, ${JSON.stringify(projectName)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { filled: true };
    })()`)
    expect(fillResult).toEqual({ filled: true })

    await waitFor("create project submit enabled", async () => {
      const submitEnabled = evalBrowser<boolean>(session, `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === "Create");
        return button instanceof HTMLButtonElement && button.disabled === false;
      })()`)
      return submitEnabled ? true : false
    })

    const submitResult = evalBrowser<{ clicked: boolean }>(session, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === "Create");
      if (!(button instanceof HTMLElement)) return { clicked: false };
      button.click();
      return { clicked: true };
    })()`)
    expect(submitResult).toEqual({ clicked: true })

    const chatStage = await waitForStage(session, "chat.ready")
    expect(chatStage.probe.missing).toEqual([])

    await stopServer(server)
    activeServers.splice(activeServers.indexOf(server), 1)

    const createdPath = path.join(fixture.homeDir, APP_NAME, "coverage-project")
    const snapshot = JSON.parse(await readFile(path.join(fixture.dataDir, "snapshot.json"), "utf8")) as {
      workspaces?: Array<{ localPath?: string }>
    }
    expect(snapshot.workspaces?.some((ws) => ws.localPath === createdPath)).toBe(true)
  }, 90_000)

  test.skip("shows reconnecting and reconnected composer states after offline recovery", async () => {
    closeAllAgentBrowsers()
    const session = `journey-${crypto.randomUUID()}`
    activeAgentBrowserSessions.add(session)

    const fixture = await createFixtureEnvironment()
    activeHomes.push(fixture.homeDir)

    const server = await startIsolatedDevServer(fixture.homeDir)
    setBrowserOffline(session, false)
    runAgentBrowserJson<Record<string, unknown>>(session, ["open", `http://127.0.0.1:${server.clientPort}/`])

    await openNewChatFromHomepage(session, fixture)

    setBrowserOffline(session, true)

    const reconnecting = await waitFor("reconnecting composer badge", async () => {
      const badge = evalBrowser<boolean>(session, `!!document.querySelector('[data-ui-id="chat.composer.connection.section"] .animate-spin')`)
      return badge || false
    }, 20_000)
    expect(reconnecting).toBe(true)

    setBrowserOffline(session, false)

    const recovered = await waitFor("chat composer recovery", async () => {
      const state = evalBrowser<{
        connectionLabel: string
        submitDisabled: boolean | null
      }>(session, `(() => {
        const connectionLabel = (document.querySelector('[data-ui-id="chat.composer.connection.section"]')?.textContent ?? "").trim();
        const submit = document.querySelector('[data-ui-id="chat.composer.submit.action"]');
        return {
          connectionLabel,
          submitDisabled: submit instanceof HTMLButtonElement ? submit.disabled : null,
        };
      })()`)
      if (state.connectionLabel.length > 0) return false
      if (state.submitDisabled !== false) return false
      return state
    }, 20_000)
    expect(recovered.submitDisabled).toBe(false)
  }, 90_000)
  })
})
