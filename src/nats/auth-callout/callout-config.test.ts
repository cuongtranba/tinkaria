import { describe, test, expect } from "bun:test"
import { buildCalloutConfig, validateCalloutConfigShape } from "./callout-config"

const FAKE_ACCOUNT_KEY = "ACPJ3QKPKLBKL6X4FAKEACCOUNTPUBLIC"
const FAKE_AUTH_USER_KEY = "UDXFAKEUSERKEY3FAKEAUTHUSERPUBLIC"

describe("buildCalloutConfig", () => {
  test("includes required auth_callout block with provided keys", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
    })

    expect(config).toContain("auth_callout")
    expect(config).toContain(`issuer: "${FAKE_ACCOUNT_KEY}"`)
    expect(config).toContain(`"${FAKE_AUTH_USER_KEY}"`)
    expect(config).toContain("jetstream")
    expect(config).toContain("websocket")
    expect(config).toContain("no_tls: true")
  })

  test("uses default host 127.0.0.1 when not specified", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
    })
    expect(config).toContain('"127.0.0.1"')
  })

  test("uses provided host", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
      host: "100.64.1.1",
    })
    expect(config).toContain('"100.64.1.1"')
  })

  test("includes storeDir when provided", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
      storeDir: "/tmp/nats-test-store",
    })
    expect(config).toContain('store_dir: "/tmp/nats-test-store"')
  })

  test("uses provided port", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
      port: 4567,
      wsPort: 4568,
    })
    expect(config).toContain("port: 4567")
    expect(config).toContain("port: 4568")
  })

  test("uses custom account name when provided", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
      accountName: "MY_ACCOUNT",
    })
    expect(config).toContain("MY_ACCOUNT")
  })

  test("no include directives (avoids wrapper mis-resolution bug)", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
    })
    expect(config).not.toContain("include")
  })
})

describe("validateCalloutConfigShape", () => {
  test("passes for a valid config", () => {
    const config = buildCalloutConfig({
      accountPublicKey: FAKE_ACCOUNT_KEY,
      authUserPublicKey: FAKE_AUTH_USER_KEY,
    })
    const { ok, missing } = validateCalloutConfigShape(config)
    expect(ok).toBe(true)
    expect(missing).toHaveLength(0)
  })

  test("fails when sections are missing", () => {
    const { ok, missing } = validateCalloutConfigShape("just some text")
    expect(ok).toBe(false)
    expect(missing.length).toBeGreaterThan(0)
  })
})
