package stream.woofservices.tweaks

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.UUID

class PingResult(val name: String, val ms: Int?, val jitter: Int?)

object Net {
    const val SITE = "https://woof-services.stream"

    /** Game server regions. Fortnite, Apex and many others run on these AWS regions. */
    val regions = listOf(
        "NA East (Virginia)" to "dynamodb.us-east-1.amazonaws.com",
        "NA Central (Ohio)" to "dynamodb.us-east-2.amazonaws.com",
        "NA West (Oregon)" to "dynamodb.us-west-2.amazonaws.com",
        "Europe (Frankfurt)" to "dynamodb.eu-central-1.amazonaws.com",
        "Europe (London)" to "dynamodb.eu-west-2.amazonaws.com",
        "Brazil (São Paulo)" to "dynamodb.sa-east-1.amazonaws.com",
        "Middle East (UAE)" to "dynamodb.me-central-1.amazonaws.com",
        "Asia (Tokyo)" to "dynamodb.ap-northeast-1.amazonaws.com",
        "Asia (Singapore)" to "dynamodb.ap-southeast-1.amazonaws.com",
        "Oceania (Sydney)" to "dynamodb.ap-southeast-2.amazonaws.com",
    )

    /** Time a TCP connection (what a game's first packet costs) a few times; median + jitter. Runs off the UI thread. */
    fun ping(name: String, host: String, samples: Int = 5): PingResult {
        val times = mutableListOf<Int>()
        repeat(samples) {
            try {
                Socket().use { s ->
                    val t0 = System.nanoTime()
                    s.connect(InetSocketAddress(host, 443), 2500)
                    times += ((System.nanoTime() - t0) / 1_000_000).toInt()
                }
            } catch (_: Exception) { /* lost sample */ }
        }
        if (times.isEmpty()) return PingResult(name, null, null)
        val sorted = times.sorted()
        return PingResult(name, sorted[sorted.size / 2], sorted.last() - sorted.first())
    }

    fun deviceId(ctx: Context): String {
        val prefs = ctx.getSharedPreferences("woof-tweaks", Context.MODE_PRIVATE)
        return prefs.getString("device-id", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("device-id", it).apply() }
    }

    /** Installation check-in: a random ID made on install, "android" and the app version. Nothing else. */
    fun checkIn(ctx: Context) {
        runCatching {
            val body = JSONObject().put("deviceId", deviceId(ctx)).put("platform", "android").put("appVersion", BuildConfig.VERSION_NAME).toString()
            val c = URL("$SITE/api/app/install").openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.connectTimeout = 8000
            c.readTimeout = 8000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("User-Agent", "WoofTweaksAndroid/${BuildConfig.VERSION_NAME}")
            c.outputStream.use { it.write(body.toByteArray()) }
            c.responseCode
            c.disconnect()
        }
    }

    fun getText(url: String, timeout: Int = 15000): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = timeout
        c.readTimeout = timeout
        c.instanceFollowRedirects = true
        c.setRequestProperty("Accept", "application/vnd.github+json")
        c.setRequestProperty("User-Agent", "WoofTweaksAndroid/${BuildConfig.VERSION_NAME}")
        try {
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }
}

/** Compare "1.2.3" style versions. */
fun cmpVersion(a: String, b: String): Int {
    val x = a.split(".").map { it.toIntOrNull() ?: 0 }
    val y = b.split(".").map { it.toIntOrNull() ?: 0 }
    for (i in 0 until 3) {
        val p = x.getOrElse(i) { 0 }
        val q = y.getOrElse(i) { 0 }
        if (p != q) return p.compareTo(q)
    }
    return 0
}
