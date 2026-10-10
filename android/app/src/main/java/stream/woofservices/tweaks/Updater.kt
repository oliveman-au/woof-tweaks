package stream.woofservices.tweaks

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Woof Tweaks for Android updates itself from the newest Woof Tweaks release on GitHub (the APK is attached to every
 * release, with a .sha256 file next to it). The download is checked against that SHA-256, and Android itself refuses
 * an APK that isn't signed with the same key as the installed app.
 *
 * Once the app has installed itself one time, Android 12+ lets later updates install without asking. The first
 * time (or on older Android), Android shows its usual "Update this app?" screen.
 */
object Updater {
    private const val API = "https://api.github.com/repos/oliveman-au/woof-tweaks/releases/latest"
    private val APK = Regex("^Woof-Tweaks-Android-([0-9]+\\.[0-9]+\\.[0-9]+)\\.apk$")

    class Available(val version: String, val apkUrl: String, val shaUrl: String, val size: Long)

    @Volatile var status: String = ""

    fun canInstall(ctx: Context) = ctx.packageManager.canRequestPackageInstalls()

    fun check(): Available? {
        val release = JSONObject(Net.getText(API))
        if (release.optBoolean("draft") || release.optBoolean("prerelease")) return null
        val assets = release.getJSONArray("assets")
        var apk: JSONObject? = null
        var sha: JSONObject? = null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            val name = a.getString("name")
            if (APK.matches(name)) apk = a
        }
        if (apk == null) return null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            if (a.getString("name") == apk.getString("name") + ".sha256") sha = a
        }
        if (sha == null) return null
        val version = APK.find(apk.getString("name"))!!.groupValues[1]
        if (cmpVersion(version, BuildConfig.VERSION_NAME) <= 0) return null
        val url = apk.getString("browser_download_url")
        val shaUrl = sha.getString("browser_download_url")
        if (!url.startsWith("https://github.com/oliveman-au/woof-tweaks/releases/download/") ||
            !shaUrl.startsWith("https://github.com/oliveman-au/woof-tweaks/releases/download/")) return null
        return Available(version, url, shaUrl, apk.optLong("size", 0))
    }

    /** Download, verify and hand to Android's installer. Runs off the UI thread. Returns a message or null. */
    fun downloadAndInstall(ctx: Context, a: Available): String? {
        if (a.size <= 0 || a.size > 200L * 1024 * 1024) return "Update information looked wrong."
        val expected = Net.getText(a.shaUrl).trim().split(Regex("\\s+")).first().lowercase()
        if (!expected.matches(Regex("^[a-f0-9]{64}$"))) return "Update checksum missing."
        val file = File(ctx.cacheDir, "update.apk")
        status = "Downloading ${a.version}…"
        val digest = MessageDigest.getInstance("SHA-256")
        var got = 0L
        val c = URL(a.apkUrl).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 15000
        c.readTimeout = 30000
        try {
            c.inputStream.use { input ->
                file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        got += n
                        if (got > a.size) throw IllegalStateException("too large")
                        digest.update(buf, 0, n)
                        out.write(buf, 0, n)
                    }
                }
            }
        } catch (e: Exception) {
            file.delete()
            return "Download failed: ${e.message}"
        } finally {
            c.disconnect()
        }
        val hex = digest.digest().joinToString("") { "%02x".format(it) }
        if (got != a.size || hex != expected) {
            file.delete()
            return "The download didn't match its checksum, so it wasn't installed."
        }
        status = "Installing ${a.version}…"
        return try {
            install(ctx, file)
            null
        } catch (e: Exception) {
            "Couldn't start the install: ${e.message}"
        } finally {
            file.delete()
        }
    }

    private fun install(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("woof-tweaks.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val intent = Intent(ctx, InstallReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(ctx, id, intent, flags).intentSender)
        }
    }

    /** The very first self-update needs one tap (Android's rule); later ones install silently on Android 12+. */
    fun notifyConfirm(ctx: Context, confirm: Intent) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("updates", "Updates", NotificationManager.IMPORTANCE_LOW))
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val pi = PendingIntent.getActivity(ctx, 7, confirm, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = android.app.Notification.Builder(ctx, "updates")
            .setSmallIcon(R.drawable.ic_paw)
            .setContentTitle("Woof Tweaks update ready")
            .setContentText("Tap to install. Future updates install by themselves.")
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        nm.notify(2, n)
    }

    /** After an update: one small notification ("it was updated"), nothing to tap. */
    fun notifyUpdated(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("updates", "Updates", NotificationManager.IMPORTANCE_LOW))
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val n = android.app.Notification.Builder(ctx, "updates")
            .setSmallIcon(R.drawable.ic_paw)
            .setContentTitle("Woof Tweaks was updated")
            .setContentText("You're now on version ${BuildConfig.VERSION_NAME}.")
            .setAutoCancel(true)
            .build()
        nm.notify(1, n)
    }
}

/** Android reports install progress here; also told when this app was replaced by a newer version. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Updater.notifyUpdated(ctx)
            return
        }
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // First self-update (or older Android): show Android's own "Update this app?" screen.
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT)
                confirm?.let {
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    // Background update: Android won't open a screen from the background, so ask with a notification.
                    Updater.notifyConfirm(ctx, it)
                    runCatching { ctx.startActivity(it) }
                }
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.status = "Updated"
            else -> Updater.status = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Update didn't install"
        }
    }
}
