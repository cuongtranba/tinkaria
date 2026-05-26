---
id: adr-20260402-retain-read-scroll-after-reply
c3-seal: cc8a3ba58d4555861da9277d66f29100abe9fbfd08fdd2449b7584af3bb514a4
title: Retain read scroll position after reply
type: adr
goal: Persist the current latest-message read watermark when the user successfully replies in an existing chat so switching away and back retains the newer end of the transcript.
status: implemented
date: "2026-04-02"
---

# Retain read scroll position after reply

## Goal

Persist the current latest-message read watermark when the user successfully replies in an existing chat so switching away and back retains the newer end of the transcript.
