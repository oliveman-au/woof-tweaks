package stream.woofservices.tweaks

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/** Where a setting lives. System = normal app permission; Global/Secure = the one-time computer (adb) grant. */
enum class Table { SYSTEM, GLOBAL, SECURE }

/** What the user has to allow before a tweak can run. */
enum class Needs { SETTINGS, ADVANCED }

enum class Risk(val label: String) { SAFE("Safe"), MODERATE("Moderate"), ADVANCED("Advanced") }

class Change(val table: Table, val key: String, val value: (Context) -> String)

class Tweak(
    val id: String,
    val title: String,
    val what: String,
    val why: String,
    val risk: Risk,
    val needs: Needs,
    val category: String,
    val changes: List<Change>,
)

/** Every tweak is a set of Android settings. The original values are saved before anything changes, so Revert
 *  puts back exactly what was there. If Android ignores a value (some phone makers lock settings), the tweak is
 *  undone and reported as not supported. */
object Tweaks {
    val all = listOf(
        Tweak(
            "screen-awake", "Screen stays on while you play",
            "Sets the screen timeout to 10 minutes.",
            "Stops the screen dimming and locking in lobbies, loading screens and while you spectate.",
            Risk.SAFE, Needs.SETTINGS, "Gaming",
            listOf(Change(Table.SYSTEM, Settings.System.SCREEN_OFF_TIMEOUT) { "600000" }),
        ),
        Tweak(
            "brightness-manual", "No auto-brightness mid-game",
            "Turns off adaptive brightness (your current brightness stays).",
            "Adaptive brightness dims the screen in dark scenes, right when you need to see enemies.",
            Risk.SAFE, Needs.SETTINGS, "Gaming",
            listOf(Change(Table.SYSTEM, Settings.System.SCREEN_BRIGHTNESS_MODE) { Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString() }),
        ),
        Tweak(
            "haptics-off", "Touch vibration off",
            "Turns off the small vibration when you tap buttons and keys.",
            "Less vibration motor use during long sessions; some players find it distracting.",
            Risk.SAFE, Needs.SETTINGS, "Gaming",
            listOf(Change(Table.SYSTEM, Settings.System.HAPTIC_FEEDBACK_ENABLED) { "0" }),
        ),
        Tweak(
            "touch-sounds-off", "Touch sounds off",
            "Turns off the click sound when you tap the screen.",
            "Keeps game audio clean (footsteps!) without system clicks on top.",
            Risk.SAFE, Needs.SETTINGS, "Gaming",
            listOf(Change(Table.SYSTEM, Settings.System.SOUND_EFFECTS_ENABLED) { "0" }),
        ),
        Tweak(
            "animations-fast", "Faster animations (0.5x)",
            "Halves Android's window, transition and animator animation times.",
            "Menus, app switching and opening games feel noticeably snappier.",
            Risk.SAFE, Needs.ADVANCED, "Speed",
            listOf(
                Change(Table.GLOBAL, Settings.Global.WINDOW_ANIMATION_SCALE) { "0.5" },
                Change(Table.GLOBAL, Settings.Global.TRANSITION_ANIMATION_SCALE) { "0.5" },
                Change(Table.GLOBAL, Settings.Global.ANIMATOR_DURATION_SCALE) { "0.5" },
            ),
        ),
        Tweak(
            "wifi-scan-off", "No background Wi-Fi scanning",
            "Stops apps and location services scanning for Wi-Fi networks while Wi-Fi is off or in the background.",
            "Background scans can cause small ping spikes and use battery. Location may be a little less precise indoors.",
            Risk.SAFE, Needs.ADVANCED, "Network",
            listOf(Change(Table.GLOBAL, "wifi_scan_always_enabled") { "0" }),
        ),
        Tweak(
            "ble-scan-off", "No background Bluetooth scanning",
            "Stops background Bluetooth scanning for nearby devices.",
            "Bluetooth and Wi-Fi share the same radio on most phones; fewer scans means steadier Wi-Fi in game.",
            Risk.SAFE, Needs.ADVANCED, "Network",
            listOf(Change(Table.GLOBAL, "ble_scan_always_enabled") { "0" }),
        ),
        Tweak(
            "mobile-data-standby", "Don't keep mobile data on with Wi-Fi",
            "Turns off \"Mobile data always active\".",
            "Saves battery and stops the phone juggling two connections while you play on Wi-Fi.",
            Risk.SAFE, Needs.ADVANCED, "Network",
            listOf(Change(Table.GLOBAL, "mobile_data_always_on") { "0" }),
        ),
        Tweak(
            "private-dns-cloudflare", "Fast private DNS (Cloudflare)",
            "Sets Private DNS to one.one.one.one.",
            "Encrypted DNS that's usually faster than your provider's, so matchmaking and downloads start sooner.",
            Risk.MODERATE, Needs.ADVANCED, "Network",
            listOf(
                Change(Table.GLOBAL, "private_dns_mode") { "hostname" },
                Change(Table.GLOBAL, "private_dns_specifier") { "one.one.one.one" },
            ),
        ),
        Tweak(
            "awake-charging", "Screen on while charging",
            "Keeps the screen awake whenever the phone is plugged in.",
            "Long sessions on the charger never time out. Turn it off if you leave your phone charging overnight with the screen up.",
            Risk.MODERATE, Needs.ADVANCED, "Gaming",
            listOf(Change(Table.GLOBAL, Settings.Global.STAY_ON_WHILE_PLUGGED_IN) { "7" }),
        ),
        Tweak(
            "adaptive-battery-off", "Adaptive Battery off",
            "Turns off Adaptive Battery, which limits apps it thinks you don't use much.",
            "Stops Android throttling your game's background services (voice chat, party invites). Uses a bit more battery.",
            Risk.ADVANCED, Needs.ADVANCED, "Speed",
            listOf(Change(Table.GLOBAL, "adaptive_battery_management_enabled") { "0" }),
        ),
    )

    /** The tweaks Game Mode switches on for a session and switches back off afterwards. */
    val session = listOf("screen-awake", "brightness-manual", "touch-sounds-off")

    fun byId(id: String) = all.firstOrNull { it.id == id }
}

class TweakEngine(private val ctx: Context) {
    private val prefs = ctx.getSharedPreferences("woof-tweaks", Context.MODE_PRIVATE)
    private val cr get() = ctx.contentResolver
    private val nm get() = ctx.getSystemService(NotificationManager::class.java)

    fun canWriteSettings() = Settings.System.canWrite(ctx)
    fun hasAdvanced() = ctx.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED
    fun hasDnd() = nm.isNotificationPolicyAccessGranted

    fun allowed(t: Tweak) = when (t.needs) {
        Needs.SETTINGS -> canWriteSettings()
        Needs.ADVANCED -> hasAdvanced()
    }

    private fun read(c: Change): String? = when (c.table) {
        Table.SYSTEM -> Settings.System.getString(cr, c.key)
        Table.GLOBAL -> Settings.Global.getString(cr, c.key)
        Table.SECURE -> Settings.Secure.getString(cr, c.key)
    }

    private fun write(c: Change, v: String?): Boolean = when (c.table) {
        Table.SYSTEM -> Settings.System.putString(cr, c.key, v)
        Table.GLOBAL -> Settings.Global.putString(cr, c.key, v)
        Table.SECURE -> Settings.Secure.putString(cr, c.key, v)
    }

    private fun same(a: String?, b: String?): Boolean {
        if (a == b) return true
        val x = a?.toFloatOrNull()
        val y = b?.toFloatOrNull()
        return x != null && y != null && x == y
    }

    /** Applied = we changed it (and have the originals saved). */
    fun isApplied(t: Tweak) = prefs.contains("orig:${t.id}")

    /** Already at the tweaked values (whoever set them). */
    fun isAtTarget(t: Tweak) = t.changes.all { same(read(it), it.value(ctx)) }

    /** Apply all-or-nothing. Returns null on success, or a message for the user. */
    fun apply(t: Tweak): String? {
        if (!allowed(t)) return "Allow access first."
        if (isApplied(t)) return null
        val originals = t.changes.map { read(it) }
        val written = mutableListOf<Int>()
        try {
            t.changes.forEachIndexed { i, c ->
                if (!write(c, c.value(ctx))) throw IllegalStateException("Android refused ${c.key}")
                written += i
            }
            if (!isAtTarget(t)) throw IllegalStateException("not supported on this phone")
        } catch (e: Exception) {
            for (i in written.reversed()) runCatching { write(t.changes[i], originals[i]) }
            return if (e is SecurityException) "Android didn't allow this change." else "Not supported on this phone (${e.message})."
        }
        val arr = JSONArray()
        originals.forEach { arr.put(it ?: JSONObject.NULL) }
        prefs.edit().putString("orig:${t.id}", arr.toString()).apply()
        return null
    }

    /** Put back exactly the values that were there before. */
    fun revert(t: Tweak): String? {
        val saved = prefs.getString("orig:${t.id}", null) ?: return null
        if (!allowed(t)) return "Allow access first."
        val arr = JSONArray(saved)
        var failed = false
        t.changes.forEachIndexed { i, c ->
            val v = if (i < arr.length() && !arr.isNull(i)) arr.getString(i) else null
            val ok = runCatching { write(c, v ?: defaultFor(c)) }.getOrDefault(false)
            if (!ok) failed = true
        }
        prefs.edit().remove("orig:${t.id}").apply()
        return if (failed) "Some values couldn't be put back." else null
    }

    /** When a setting had no value before, put back Android's default instead of leaving ours. */
    private fun defaultFor(c: Change): String? = when (c.key) {
        Settings.Global.WINDOW_ANIMATION_SCALE, Settings.Global.TRANSITION_ANIMATION_SCALE, Settings.Global.ANIMATOR_DURATION_SCALE -> "1.0"
        "private_dns_mode" -> "opportunistic"
        "wifi_scan_always_enabled", "ble_scan_always_enabled", "mobile_data_always_on", "adaptive_battery_management_enabled" -> "1"
        Settings.Global.STAY_ON_WHILE_PLUGGED_IN -> "0"
        else -> null
    }

    fun appliedCount() = Tweaks.all.count { isApplied(it) }

    // ---- Game Mode (a session: on when you start playing, everything back when you stop)

    fun sessionActive() = prefs.getBoolean("session", false)

    /** Returns how many things were switched on. */
    fun startSession(dnd: Boolean): Int {
        var n = 0
        val ours = mutableListOf<String>()
        for (id in Tweaks.session) {
            val t = Tweaks.byId(id) ?: continue
            if (allowed(t) && !isApplied(t) && apply(t) == null) { ours += id; n++ }
        }
        var dndWas = -1
        if (dnd && hasDnd()) {
            dndWas = nm.currentInterruptionFilter
            if (dndWas != NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
                n++
            } else dndWas = -1
        }
        prefs.edit().putBoolean("session", true).putString("session-tweaks", ours.joinToString(",")).putInt("session-dnd", dndWas).apply()
        return n
    }

    fun endSession() {
        prefs.getString("session-tweaks", "")!!.split(",").filter { it.isNotBlank() }.forEach { id -> Tweaks.byId(id)?.let { revert(it) } }
        val dndWas = prefs.getInt("session-dnd", -1)
        if (dndWas >= 0 && hasDnd()) runCatching { nm.setInterruptionFilter(dndWas) }
        prefs.edit().putBoolean("session", false).remove("session-tweaks").remove("session-dnd").apply()
    }
}
