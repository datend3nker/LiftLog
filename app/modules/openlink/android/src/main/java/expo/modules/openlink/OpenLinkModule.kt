package expo.modules.openlink

import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import tech.mmarca.openlink.OpenLink
import tech.mmarca.openlink.OpenLinkDevice
import tech.mmarca.openlink.OpenLinkProfile
import tech.mmarca.openlink.OpenLinkRecordingMode
import tech.mmarca.openlink.OpenLinkRecordingRequest
import tech.mmarca.openlink.OpenLinkRecordingState
import tech.mmarca.openlink.client.OpenLinkClient
import tech.mmarca.openlink.client.OpenLinkStatus

/**
 * LiftLog as an OpenLink client of OpenWatch. The client lives for the whole process, not for
 * this module instance: a recorded workout must keep its controller across a JS reload.
 */
class OpenLinkModule : Module() {
  private var scope: CoroutineScope? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("OpenLink")

    Events(STATUS_EVENT, DEVICES_EVENT, RECORDING_STATE_EVENT)

    OnCreate {
      if (!isSupported()) return@OnCreate
      val client = clientFor(context)
      scope = CoroutineScope(SupervisorJob() + Dispatchers.Default).apply {
        launch { client.status.collect { sendEvent(STATUS_EVENT, it.toMap()) } }
        launch { client.devices.collect { sendEvent(DEVICES_EVENT, mapOf("devices" to it.map(OpenLinkDevice::toMap))) } }
        launch { client.recordingStates.collect { sendEvent(RECORDING_STATE_EVENT, it.toMap()) } }
      }
    }

    OnDestroy {
      scope?.cancel()
      scope = null
    }

    Function("isSupported") { isSupported() }

    Function("isHostInstalled") { isSupported() && clientFor(context).isHostInstalled() }

    Function("getStatus") { if (isSupported()) clientFor(context).status.value.toMap() else OpenLinkStatus.Stopped.toMap() }

    Function("getDevices") { if (isSupported()) clientFor(context).devices.value.map(OpenLinkDevice::toMap) else emptyList() }

    Function("start") { withClient { start() } }

    Function("stop") { withClient { stop() } }

    Function("refresh") { withClient { refresh() } }

    Function("trustHost") { signerSha256: String -> withClient { trustHost(signerSha256) } }

    Function("openConsent") {
      val activity = appContext.currentActivity ?: return@Function false
      isSupported() && clientFor(context).openConsent(activity)
    }

    Function("startRecording") { sessionId: String, deviceId: String, exerciseType: Int, startedAtMillis: Double ->
      withClient {
        startRecording(
          OpenLinkRecordingRequest(
            sessionId = sessionId,
            exerciseType = exerciseType,
            startedAtMillis = startedAtMillis.toLong(),
            deviceId = deviceId,
            mode = OpenLinkRecordingMode.RECORD,
          ),
        )
      }
    }

    Function("pauseRecording") { sessionId: String -> withClient { pauseRecording(sessionId) } }

    Function("resumeRecording") { sessionId: String -> withClient { resumeRecording(sessionId) } }

    Function("stopRecording") { sessionId: String -> withClient { stopRecording(sessionId) } }

    Function("setBodyWeight") { weightKg: Double, atMillis: Double ->
      withClient { setProfile(OpenLinkProfile(weightKg = weightKg, updatedAtMillis = atMillis.toLong())) }
    }
  }

  private inline fun withClient(block: OpenLinkClient.() -> Unit) {
    if (isSupported()) clientFor(context).block()
  }

  companion object {
    private const val STATUS_EVENT = "onStatus"
    private const val DEVICES_EVENT = "onDevices"
    private const val RECORDING_STATE_EVENT = "onRecordingState"

    private const val HOST_PACKAGE = "tech.mmarca.openwatch"

    @Volatile
    private var client: OpenLinkClient? = null

    /** OpenLink declares API 26 as its minimum; LiftLog still runs from 24. */
    private fun isSupported() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    @Synchronized
    private fun clientFor(context: Context): OpenLinkClient = client ?: OpenLinkClient(
      context = context,
      hostPackage = HOST_PACKAGE,
      requestedCapabilities = OpenLink.ALL_CAPABILITIES,
      appVersion = appVersion(context),
    ).also { client = it }

    private fun appVersion(context: Context): String =
      runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()
  }
}

private fun OpenLinkStatus.toMap(): Map<String, Any?> = when (this) {
  OpenLinkStatus.Stopped -> mapOf("kind" to "stopped")
  OpenLinkStatus.HostMissing -> mapOf("kind" to "hostMissing")
  OpenLinkStatus.Unreachable -> mapOf("kind" to "unreachable")
  OpenLinkStatus.Connecting -> mapOf("kind" to "connecting")
  is OpenLinkStatus.HostUntrusted -> mapOf("kind" to "hostUntrusted", "signerSha256" to signerSha256)
  is OpenLinkStatus.Connected -> mapOf(
    "kind" to "connected",
    "protocolVersion" to state.protocolVersion,
    "trust" to state.trust.name,
    "grantedCapabilities" to state.grantedCapabilities.toList(),
    "canOpenConsent" to (state.consentIntent != null),
  )
}

private fun OpenLinkDevice.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "displayName" to displayName,
  "kind" to kind.name,
  "connection" to connection.name,
  "batteryPercent" to batteryPercent,
  "supportsRecording" to supportsRecording,
  "recordingFeatures" to recordingFeatures.map { it.name },
  "exerciseTypes" to exerciseTypes.toList(),
)

private fun OpenLinkRecordingState.toMap(): Map<String, Any?> = mapOf(
  "sessionId" to sessionId,
  "deviceId" to deviceId,
  "phase" to phase.name,
  "reason" to reason,
  "atMillis" to atMillis.toDouble(),
  "summary" to summary?.let {
    mapOf(
      "zoneSeconds" to it.zoneSeconds,
      "zoneLowerBoundsBpm" to it.zoneLowerBoundsBpm,
      "trimp" to it.trimp,
      "heartRateRecovery1MinBpm" to it.heartRateRecovery1MinBpm,
      "heartRateRecovery2MinBpm" to it.heartRateRecovery2MinBpm,
    )
  },
)
