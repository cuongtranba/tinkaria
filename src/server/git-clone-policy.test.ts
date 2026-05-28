import { describe, test, expect, afterEach } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { EventStore } from "./event-store"
import { RepoManager } from "./repo-manager"
import { GitClonePolicy } from "./git-clone-policy"

describe("GitClonePolicy", () => {
  const tempDirs: string[] = []

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "git-clone-policy-"))
    tempDirs.push(dir)
    return dir
  }

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
    tempDirs.length = 0
  })

  test("successful clone sets status to cloned with correct path and branch", async () => {
    const dataDir = await makeTempDir()
    const store = new EventStore(dataDir)
    await store.initialize()
    const repoManager = new RepoManager()

    let stateChanged = false
    const policy = new GitClonePolicy(store, repoManager, () => {
      stateChanged = true
    })

    // Create a bare repo to clone from
    const bareDir = await makeTempDir()
    await $`git init --bare ${bareDir}`.quiet()

    // Need at least one commit so branch exists
    const seedDir = await makeTempDir()
    await $`git clone ${bareDir} ${seedDir}`.quiet()
    await $`git -C ${seedDir} -c user.email=ci@example.com -c user.name=CI commit --allow-empty -m "init"`.quiet()
    await $`git -C ${seedDir} push origin main`.quiet().nothrow()
    // Push whatever default branch was created
    await $`git -C ${seedDir} push`.quiet()

    const repoId = "repo-1"
    const workspaceId = "ws-1"
    const targetPath = path.join(await makeTempDir(), "cloned-repo")

    await store.startRepoClone(repoId, workspaceId, bareDir, targetPath, "test-repo")
    expect(store.state.reposById.get(repoId)?.status).toBe("pending")

    await policy.onRepoCloneStarted(repoId, bareDir, targetPath)

    const repo = store.state.reposById.get(repoId)
    expect(repo).toBeDefined()
    expect(repo!.status).toBe("cloned")
    expect(repo!.localPath).toBe(targetPath)
    expect(repo!.branch).toBeTruthy()
    expect(store.state.reposByPath.has(targetPath)).toBe(true)
    expect(stateChanged).toBe(true)
  })

  test("onStateChange throwing does not prevent clone from completing", async () => {
    const dataDir = await makeTempDir()
    const store = new EventStore(dataDir)
    await store.initialize()
    const repoManager = new RepoManager()

    const policy = new GitClonePolicy(store, repoManager, () => {
      throw new Error("broadcast exploded")
    })

    const bareDir = await makeTempDir()
    await $`git init --bare ${bareDir}`.quiet()
    const seedDir = await makeTempDir()
    await $`git clone ${bareDir} ${seedDir}`.quiet()
    await $`git -C ${seedDir} -c user.email=ci@example.com -c user.name=CI commit --allow-empty -m "init"`.quiet()
    await $`git -C ${seedDir} push`.quiet()

    const repoId = "repo-safe"
    const targetPath = path.join(await makeTempDir(), "safe-clone")
    await store.startRepoClone(repoId, "ws-safe", bareDir, targetPath, null)

    await policy.onRepoCloneStarted(repoId, bareDir, targetPath)

    expect(store.state.reposById.get(repoId)!.status).toBe("cloned")
  })

  test("onStateChange throwing does not prevent error status on failed clone", async () => {
    const dataDir = await makeTempDir()
    const store = new EventStore(dataDir)
    await store.initialize()
    const repoManager = new RepoManager()

    const policy = new GitClonePolicy(store, repoManager, () => {
      throw new Error("broadcast exploded")
    })

    const repoId = "repo-safe-fail"
    const targetPath = path.join(await makeTempDir(), "should-fail")
    await store.startRepoClone(repoId, "ws-safe", "/nonexistent/path", targetPath, null)

    await policy.onRepoCloneStarted(repoId, "/nonexistent/path", targetPath)

    expect(store.state.reposById.get(repoId)!.status).toBe("error")
  })

  test("failed clone sets status to error", async () => {
    const dataDir = await makeTempDir()
    const store = new EventStore(dataDir)
    await store.initialize()
    const repoManager = new RepoManager()

    let stateChanged = false
    const policy = new GitClonePolicy(store, repoManager, () => {
      stateChanged = true
    })

    const repoId = "repo-2"
    const workspaceId = "ws-2"
    const badOrigin = "/nonexistent/repo/path"
    const targetPath = path.join(await makeTempDir(), "should-fail")

    await store.startRepoClone(repoId, workspaceId, badOrigin, targetPath, null)
    expect(store.state.reposById.get(repoId)?.status).toBe("pending")

    await policy.onRepoCloneStarted(repoId, badOrigin, targetPath)

    const repo = store.state.reposById.get(repoId)
    expect(repo).toBeDefined()
    expect(repo!.status).toBe("error")
    expect(stateChanged).toBe(true)
  })
})
