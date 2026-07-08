package com.argos.remotecontrol

import android.content.Context
import java.util.UUID

/** Preferencias del enrolamiento (URL del servidor, token, id estable del equipo). */
object Prefs {
    private const val NAME = "argos_rc"

    private fun sp(ctx: Context) = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun serverUrl(ctx: Context): String =
        sp(ctx).getString("server_url", BuildConfig.DEFAULT_SERVER_URL) ?: ""

    fun enrollToken(ctx: Context): String =
        sp(ctx).getString("enroll_token", BuildConfig.DEFAULT_ENROLL_TOKEN) ?: ""

    fun isEnrolled(ctx: Context): Boolean = sp(ctx).getBoolean("enrolled", false)

    /** Id estable por dispositivo, generado la primera vez. */
    fun deviceId(ctx: Context): String {
        sp(ctx).getString("device_id", null)?.let { return it }
        val id = "and-" + UUID.randomUUID().toString().substring(0, 8)
        sp(ctx).edit().putString("device_id", id).apply()
        return id
    }

    fun save(ctx: Context, serverUrl: String, token: String) {
        sp(ctx).edit()
            .putString("server_url", serverUrl.trim())
            .putString("enroll_token", token.trim())
            .putBoolean("enrolled", true)
            .apply()
    }
}
