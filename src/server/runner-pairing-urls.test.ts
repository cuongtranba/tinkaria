/**
 * Unit tests for resolveRunnerPairingUrls — the pairing-exchange NATS URL
 * advertiser. Regression target: a runner paired against a server bound to
 * 0.0.0.0 must NOT receive nats://0.0.0.0:<port> (ECONNREFUSED on a remote box).
 */

import { describe, test, expect } from "bun:test"
import { resolveRunnerPairingUrls } from "./runner-pairing-urls"

const wildcard = { url: "nats://0.0.0.0:50640", wsUrl: "ws://0.0.0.0:50641" }

describe("resolveRunnerPairingUrls", () => {
  test("rewrites both hosts to NATS_ADVERTISED_HOST when set", () => {
    const result = resolveRunnerPairingUrls(wildcard, {
      NATS_ADVERTISED_HOST: "100.64.0.2",
    })
    expect(result).toEqual({
      ok: true,
      natsUrl: "nats://100.64.0.2:50640",
      natsWsUrl: "ws://100.64.0.2:50641",
    })
  })

  test("advertised host wins even over an already-concrete daemon host", () => {
    const result = resolveRunnerPairingUrls(
      { url: "nats://127.0.0.1:4222", wsUrl: "ws://127.0.0.1:4223" },
      { NATS_ADVERTISED_HOST: "192.168.1.50" },
    )
    expect(result).toEqual({
      ok: true,
      natsUrl: "nats://192.168.1.50:4222",
      natsWsUrl: "ws://192.168.1.50:4223",
    })
  })

  test("rejects a 0.0.0.0 bind host when no advertised host is set", () => {
    const result = resolveRunnerPairingUrls(wildcard, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("NATS_ADVERTISED_HOST")
  })

  test("rejects IPv6 wildcard hosts (:: and [::])", () => {
    for (const url of ["nats://[::]:50640"]) {
      const result = resolveRunnerPairingUrls({ url, wsUrl: "ws://[::]:50641" }, {})
      expect(result.ok).toBe(false)
    }
  })

  test("passes a concrete host through unchanged", () => {
    const info = { url: "nats://127.0.0.1:4222", wsUrl: "ws://127.0.0.1:4223" }
    const result = resolveRunnerPairingUrls(info, {})
    expect(result).toEqual({ ok: true, natsUrl: info.url, natsWsUrl: info.wsUrl })
  })

  test("blank NATS_ADVERTISED_HOST is treated as unset", () => {
    const result = resolveRunnerPairingUrls(wildcard, { NATS_ADVERTISED_HOST: "   " })
    expect(result.ok).toBe(false)
  })
})
