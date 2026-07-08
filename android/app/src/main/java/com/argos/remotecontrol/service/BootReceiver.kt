package com.argos.remotecontrol.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.argos.remotecontrol.Prefs

/**
 * Relanza el servicio tras reiniciar el equipo (auto-registro). El control, la
 * galería y los archivos vuelven a funcionar de inmediato; la captura de pantalla
 * requiere re-conceder el permiso de MediaProjection al abrir la app (regla de Android).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs.isEnrolled(context)) {
            ManagerForegroundService.start(context)
        }
    }
}
