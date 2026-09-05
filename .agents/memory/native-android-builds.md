---
name: Native Android builds
description: Constraints around producing installable Android artifacts from this Expo workspace
---
The mobile app can be linked to an Expo project, but the current Replit workspace does not include a local Android SDK, Gradle, or a callable native build command. Its custom build script produces static Expo bundles, not APK/AAB files.

**Why:** The workspace is configured for Replit-managed Expo development and preview; native Android builds use a separate guided/cloud build flow.

**How to apply:** Do not claim an APK/AAB was created from shell commands here. Use Replit’s guided mobile build/publish flow when available, or use the connected Expo project’s supported cloud build flow outside this workspace.