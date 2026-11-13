# Recording workouts on a watch (OpenLink)

LiftLog plans and logs the gym workout. Measuring the body during it (heart rate, calories, the exercise
session itself) is the job of the watch app. On Android, LiftLog tells
[OpenWatch](https://github.com/Hale-MTU/OpenLink) through the OpenLink protocol that a gym workout is
running, so the watch records it as a gym workout. LiftLog never requests, shows or stores the watch's
heart rate.

Today the only thing OpenWatch learns about the workout is its Health Connect exercise type (strength
training). The OpenLink recording request has no field for exercises, sets or plans. Sending those would
need a protocol change in OpenLink first.

Android only. Everywhere else (iOS, web, tests) the native module does not exist and every call is a no-op.

## What the user sees

- **Settings -> Workout settings -> Record workouts on your watch**: opt-in switch (also offered in the
  welcome wizard and a What's New entry, only when OpenWatch is installed).
- When enabled, one extra row appears if something is left to do:
  - **Trust OpenWatch**: LiftLog has not seen this copy of OpenWatch's signing key before. The user
    confirms the key fingerprint.
  - **Allow LiftLog in OpenWatch**: OpenWatch has not granted LiftLog access yet. Opens its consent screen.

## What happens during a workout

1. A LiftLog workout starts. If OpenLink is connected at protocol version 2 or higher, has the
   `recording` capability, and a connected watch can record a gym workout, LiftLog asks the host to
   start recording on that watch with a gym exercise type. The LiftLog session id is the OpenLink session id.
2. If LiftLog started before the link was up, the start is sent as soon as it is. Sending a start the
   host already has is answered with where the workout stands, so restarts of the app are safe.
3. The workout ends (or a different session becomes active): LiftLog stops the recording.
4. When a session finishes with a body weight and the `profile` capability is granted, the body weight is
   shared with OpenWatch.

## Health Connect: whoever measures writes

If the watch actually recorded the workout (the host reported `RECORDING` or `PAUSED` at least once),
LiftLog does **not** write its own exercise session to Health Connect, otherwise it would show up twice.
It still writes what it measured itself, such as body weight. See `exportWorkout(workout, { withExerciseSession })`
in `app/src/services/health-export-service-shared.ts`.

## Code map

| Piece | Path |
| --- | --- |
| Native Expo module (Kotlin, Android only) | `app/modules/openlink/` |
| OpenLink client and contract (git submodule) | `app/modules/openlink/openlink` |
| JS service, no-op without the module | `app/src/services/open-link-service.ts` |
| Redux slice, selectors, device picking | `app/src/store/open-link/index.ts` |
| Effects: start, stop, body weight, on/off | `app/src/store/open-link/effects.ts` |
| Settings UI and switch | `app/src/components/smart/watch-recording-settings.tsx` |
| Setting | `recordWorkoutsOnWatch` in the settings registry |

The slice also receives the host's recording state (`RECORDING`, `PAUSED`, `STOPPED`, `FAILED`), which
decides the Health Connect behavior above.

## Building

The submodule must be present: `git submodule update --init`.

OpenLink's own Gradle build needs AGP 9, React Native's needs AGP 8, so they cannot share one Gradle
build. The module's `android/build.gradle` instead compiles the submodule's `client` and `contract`
sources (including the AIDL) directly into the Expo module.

Gradle needs JDK 17 to 21; newer JDKs fail with `Unsupported class file major version`. Quick compile
check of the module alone:

```sh
cd app
npx expo prebuild --platform android --no-install
cd android && ./gradlew :openlink:compileDebugKotlin
```

## Testing without a watch

Unit tests (`app/src/store/open-link/effects.spec.ts`) drive the effects with a fake service. A real run
needs an Android device with OpenWatch installed and a paired watch.
