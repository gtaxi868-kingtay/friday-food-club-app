---
name: Expo Go workflow prompt
description: Replit's noninteractive Expo workflow must avoid the CLI account-selection prompt triggered by an Expo Go request.
---

The mobile dev workflow runs Expo with CI mode so it cannot pause on the unverified-app login/anonymous-selection prompt while a phone is connecting.

**Why:** The workflow can report a healthy tunnel while Expo Go waits indefinitely for input that no workflow terminal can provide.

**How to apply:** Keep the Expo workflow noninteractive, use the latest Replit Preview on your phone QR/deep link after restarts, and treat Expo Go account prompts as a managed Replit sign-in flow rather than a project code error.

An otherwise healthy Expo workflow can also fail when the ngrok tunnel reports “remote gone away”; restarting the managed workflow is the first recovery and does not require app-code changes.