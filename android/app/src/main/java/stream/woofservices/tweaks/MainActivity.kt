package stream.woofservices.tweaks

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.drawable.toBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val Brand = Color(0xFF8B7BFF)
private val Bg = Color(0xFF07080D)
private val Surface1 = Color(0xFF12131C)
private val Surface2 = Color(0xFF1A1B27)
private val Muted = Color(0xFFA7A9BE)
private val Good = Color(0xFF3DDC97)
private val Warn = Color(0xFFFFB547)
private val Bad = Color(0xFFFF6B81)

private const val ADB_GRANT = "adb shell pm grant stream.woofservices.tweaks android.permission.WRITE_SECURE_SETTINGS"

class MainActivity : ComponentActivity() {
    private val resumed = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("woof-tweaks", Context.MODE_PRIVATE)
        val last = prefs.getString("last-version", null)
        val justUpdated = last != null && cmpVersion(BuildConfig.VERSION_NAME, last) > 0
        prefs.edit().putString("last-version", BuildConfig.VERSION_NAME).apply()
        val underTest = runCatching { Class.forName("androidx.test.platform.app.InstrumentationRegistry") }.isSuccess
        if (!underTest) Thread {
            Net.checkIn(this)
            // Updates are automatic: download, verify, install. Android asks only the first time.
            if (Updater.canInstall(this)) runCatching { Updater.check()?.let { Updater.downloadAndInstall(this, it) } }
        }.start()
        setContent { App(resumed.intValue, justUpdated) }
    }

    override fun onResume() {
        super.onResume()
        resumed.intValue++ // re-read permissions after coming back from Android settings
    }
}

private enum class Tab(val label: String) { HOME("Home"), TWEAKS("Tweaks"), GAMES("Games"), PING("Ping"), GUIDE("Guide") }

@Composable
private fun App(resumed: Int, justUpdated: Boolean) {
    val ctx = LocalContext.current
    val engine = remember { TweakEngine(ctx) }
    var tab by remember { mutableStateOf(Tab.HOME) }
    var refresh by remember { mutableIntStateOf(0) }
    val snack = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val notify = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notify.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (justUpdated) snack.showSnackbar("Woof Tweaks was updated to ${BuildConfig.VERSION_NAME}")
    }
    val say: (String) -> Unit = { msg -> scope.launch { snack.showSnackbar(msg) } }
    val key = resumed + refresh
    val bump = { refresh++ }

    MaterialTheme(colorScheme = darkColorScheme(primary = Brand, background = Bg, surface = Surface1, onPrimary = Color.White)) {
        Scaffold(
            containerColor = Bg,
            snackbarHost = { SnackbarHost(snack) },
            bottomBar = {
                NavigationBar(containerColor = Surface1) {
                    Tab.entries.forEach { t ->
                        NavigationBarItem(
                            selected = tab == t, onClick = { tab = t }, label = { Text(t.label) },
                            icon = {
                                Icon(when (t) { Tab.HOME -> Icons.Default.Home; Tab.TWEAKS -> Icons.Default.Build; Tab.GAMES -> Icons.Default.PlayArrow; Tab.PING -> Icons.Default.Refresh; Tab.GUIDE -> Icons.Default.Info }, null)
                            },
                        )
                    }
                }
            },
        ) { pad ->
            Box(Modifier.padding(pad).fillMaxSize().background(Bg)) {
                when (tab) {
                    Tab.HOME -> HomeScreen(engine, key, say, bump) { tab = it }
                    Tab.TWEAKS -> TweaksScreen(engine, key, say, bump)
                    Tab.GAMES -> GamesScreen(engine, say, bump)
                    Tab.PING -> PingScreen()
                    Tab.GUIDE -> GuideScreen(engine, key)
                }
            }
        }
    }
}

// ------------------------------------------------------------------ shared bits

@Composable
private fun Section(title: String, sub: String? = null, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), colors = CardDefaults.cardColors(containerColor = Surface1), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Color.White)
            if (sub != null) Text(sub, color = Muted, fontSize = 13.sp)
            content()
        }
    }
}

@Composable
private fun Pill(text: String, color: Color) {
    Text(text, color = color, fontSize = 11.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.background(color.copy(alpha = 0.14f), RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 3.dp))
}

@Composable
private fun Header(title: String, sub: String) {
    Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 8.dp)) {
        Text(title, fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Color.White)
        Text(sub, color = Muted, fontSize = 14.sp)
    }
}

private fun open(ctx: Context, intent: Intent) {
    runCatching { ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

private fun settingsAccessIntent(ctx: Context) = Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${ctx.packageName}"))
private fun dndAccessIntent() = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
private fun installAccessIntent(ctx: Context) = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))

@Composable
private fun AccessRow(title: String, sub: String, ok: Boolean, action: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Color.White, fontWeight = FontWeight.SemiBold)
            Text(sub, color = Muted, fontSize = 12.sp)
        }
        Spacer(Modifier.width(10.dp))
        if (ok) Pill("✓ Allowed", Good) else OutlinedButton(onClick = onClick) { Text(action) }
    }
}

// ------------------------------------------------------------------ Home

@Composable
private fun HomeScreen(engine: TweakEngine, key: Int, say: (String) -> Unit, bump: () -> Unit, go: (Tab) -> Unit) {
    val ctx = LocalContext.current
    @Suppress("UNUSED_VARIABLE") val k = key
    val canSettings = engine.canWriteSettings()
    val dnd = engine.hasDnd()
    val adv = engine.hasAdvanced()
    val session = engine.sessionActive()
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Header("Woof Tweaks", "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}") }
        item {
            Section("Game Mode", if (session) "On: screen stays awake, no auto-brightness, no touch sounds${if (dnd) ", notifications silenced" else ""}." else "One tap before you play. Everything goes back when you turn it off.") {
                Button(
                    onClick = {
                        if (session) {
                            engine.endSession()
                            say("Game Mode off: everything is back how it was")
                        } else if (!canSettings) {
                            open(ctx, settingsAccessIntent(ctx))
                            say("Allow Woof Tweaks to modify system settings, then come back")
                        } else {
                            val n = engine.startSession(dnd = true)
                            say("Game Mode on ($n changes)")
                        }
                        bump()
                    },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = if (session) Bad else Brand),
                ) { Text(if (session) "Turn Game Mode off" else "Turn Game Mode on", fontWeight = FontWeight.Bold) }
            }
        }
        item {
            Section("Optimise", "${engine.appliedCount()} of ${Tweaks.all.size} tweaks applied. Applies every safe tweak you have access to; each one can be reverted.") {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(onClick = {
                        var n = 0
                        var skipped = 0
                        Tweaks.all.filter { it.risk == Risk.SAFE }.forEach { t ->
                            if (!engine.allowed(t)) skipped++ else if (!engine.isApplied(t) && engine.apply(t) == null) n++
                        }
                        say(if (skipped > 0) "Applied $n tweaks. $skipped need access (see below)." else "Applied $n tweaks")
                        bump()
                    }) { Text("Optimise now") }
                    OutlinedButton(onClick = {
                        var n = 0
                        Tweaks.all.filter { engine.isApplied(it) }.forEach { if (engine.revert(it) == null) n++ }
                        say("Reverted $n tweaks")
                        bump()
                    }) { Text("Revert all") }
                }
            }
        }
        item {
            Section("Access", "Android asks you once for each of these.") {
                AccessRow("Modify system settings", "Screen timeout, brightness, touch sounds", canSettings, "Allow") { open(ctx, settingsAccessIntent(ctx)) }
                AccessRow("Do Not Disturb", "Silence notifications in Game Mode", dnd, "Allow") { open(ctx, dndAccessIntent()) }
                AccessRow("Advanced tweaks", "Animations, scanning, DNS (one-time computer step)", adv, "How") { go(Tab.GUIDE) }
                AccessRow("Automatic updates", "Lets Woof Tweaks install its own updates", Updater.canInstall(ctx), "Allow") { open(ctx, installAccessIntent(ctx)) }
            }
        }
    }
}

// ------------------------------------------------------------------ Tweaks

@Composable
private fun TweaksScreen(engine: TweakEngine, key: Int, say: (String) -> Unit, bump: () -> Unit) {
    val ctx = LocalContext.current
    @Suppress("UNUSED_VARIABLE") val k = key
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Header("Tweaks", "Every change is backed up first and can be undone.") }
        Tweaks.all.groupBy { it.category }.forEach { (category, list) ->
            item { Text(category.uppercase(), color = Brand, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(start = 20.dp, top = 14.dp, bottom = 4.dp)) }
            items(list, key = { it.id }) { t ->
                val allowed = engine.allowed(t)
                val applied = engine.isApplied(t)
                Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), colors = CardDefaults.cardColors(containerColor = Surface1), shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(t.title, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                                    Pill(t.risk.label, when (t.risk) { Risk.SAFE -> Good; Risk.MODERATE -> Warn; Risk.ADVANCED -> Bad })
                                    if (t.needs == Needs.ADVANCED) Pill("Advanced access", Brand)
                                    if (!applied && engine.isAtTarget(t)) Pill("Already set", Muted)
                                }
                            }
                            Switch(checked = applied, enabled = allowed || applied, onCheckedChange = { on ->
                                val err = if (on) engine.apply(t) else engine.revert(t)
                                say(err ?: if (on) "${t.title}: on" else "${t.title}: reverted")
                                bump()
                            })
                        }
                        Text(t.what, color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                        Text("Why: ${t.why}", color = Muted, fontSize = 12.sp)
                        if (!allowed && !applied) {
                            TextButton(onClick = { if (t.needs == Needs.SETTINGS) open(ctx, settingsAccessIntent(ctx)) else say("See Guide → Unlock advanced tweaks") }, contentPadding = PaddingValues(0.dp)) {
                                Text(if (t.needs == Needs.SETTINGS) "Allow \"Modify system settings\" to use this" else "Needs the one-time advanced unlock (Guide tab)", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Games

private class Game(val pkg: String, val label: String, val icon: ImageBitmap?)

private val GAME_TIPS = mapOf(
    "com.epicgames.fortnite" to "Fortnite: set 3D resolution and quality to what holds your max FPS steadily, turn on 120 FPS mode if your phone has it, and play on 5 GHz Wi-Fi.",
    "com.tencent.ig" to "PUBG Mobile: pick the highest frame-rate option your phone allows (Graphics → Frame rate) over higher graphics; turn on Game Mode first.",
    "com.activision.callofduty.shooter" to "CoD Mobile: max frame rate first, graphics quality second. Download the HD resources only if you have the storage.",
    "com.roblox.client" to "Roblox: lower Graphics Quality to manual 4–6 for steady FPS; close other apps first.",
    "com.mojang.minecraftpe" to "Minecraft: render distance 8–12 chunks and turn off Fancy Graphics / Beautiful Skies for smoother play.",
    "com.dts.freefireth" to "Free Fire: turn on High FPS in Settings → Graphics, and lower graphics to Smooth for the steadiest frame rate.",
    "com.supercell.brawlstars" to "Brawl Stars: turn on 60/120 FPS in Settings → Graphics if your phone supports it.",
    "com.miHoYo.GenshinImpact" to "Genshin Impact: set FPS to 60 and lower render resolution before other effects; play while charging only if the phone stays cool.",
    "com.mobile.legends" to "Mobile Legends: turn on High Frame Rate and Ultra refresh rate if offered; use the network accelerator only if your ping is unstable.",
)

private fun findGames(ctx: Context): List<Game> {
    val pm = ctx.packageManager
    val launch = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    @Suppress("DEPRECATION")
    val list = pm.queryIntentActivities(launch, 0)
    return list.mapNotNull { ri ->
        val ai = ri.activityInfo.applicationInfo
        @Suppress("DEPRECATION")
        val isGame = ai.category == ApplicationInfo.CATEGORY_GAME || (ai.flags and ApplicationInfo.FLAG_IS_GAME) != 0 || GAME_TIPS.containsKey(ai.packageName)
        if (!isGame || ai.packageName == ctx.packageName) null
        else Game(ai.packageName, ri.loadLabel(pm).toString(), runCatching { ri.loadIcon(pm).toBitmap(96, 96).asImageBitmap() }.getOrNull())
    }.distinctBy { it.pkg }.sortedBy { it.label.lowercase() }
}

@Composable
private fun GamesScreen(engine: TweakEngine, say: (String) -> Unit, bump: () -> Unit) {
    val ctx = LocalContext.current
    val games = remember { mutableStateListOf<Game>() }
    var loaded by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        val found = withContext(Dispatchers.IO) { findGames(ctx) }
        games.clear(); games.addAll(found); loaded = true
    }
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Header("Games", "Start a game with Game Mode on. Turn it off on the Home tab when you're done.") }
        if (loaded && games.isEmpty()) item { Section("No games found", "Games show up here once they're installed.") {} }
        items(games, key = { it.pkg }) { g ->
            Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), colors = CardDefaults.cardColors(containerColor = Surface1), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (g.icon != null) Image(g.icon, null, Modifier.size(44.dp)) else Box(Modifier.size(44.dp).background(Surface2, RoundedCornerShape(10.dp)))
                        Spacer(Modifier.width(12.dp))
                        Text(g.label, color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Button(onClick = {
                            if (!engine.sessionActive() && engine.canWriteSettings()) engine.startSession(dnd = true)
                            bump()
                            val intent = ctx.packageManager.getLaunchIntentForPackage(g.pkg)
                            if (intent != null) open(ctx, intent) else say("Couldn't open ${g.label}")
                        }) { Text("Play") }
                    }
                    GAME_TIPS[g.pkg]?.let { Text(it, color = Muted, fontSize = 12.sp) }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Ping

@Composable
private fun PingScreen() {
    val results = remember { mutableStateListOf<PingResult>() }
    var running by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Header("Ping", "How fast your connection reaches game server regions right now.") }
        item {
            Section("Test your ping", "Pick the lowest region in-game (Fortnite: Settings → Game → Matchmaking Region). Under 60 ms is great; jitter under 10 ms means a steady connection.") {
                Button(enabled = !running, onClick = {
                    running = true
                    results.clear()
                    scope.launch {
                        for ((name, host) in Net.regions) {
                            val r = withContext(Dispatchers.IO) { Net.ping(name, host) }
                            results.add(r)
                        }
                        running = false
                    }
                }, modifier = Modifier.fillMaxWidth()) { Text(if (running) "Testing…" else "Run ping test") }
            }
        }
        items(results.sortedBy { it.ms ?: Int.MAX_VALUE }, key = { it.name }) { r ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(r.name, color = Color.White, modifier = Modifier.weight(1f))
                if (r.ms == null) Pill("no reply", Muted)
                else {
                    Text("±${r.jitter} ms  ", color = Muted, fontSize = 12.sp)
                    Pill("${r.ms} ms", when { r.ms < 60 -> Good; r.ms < 120 -> Warn; else -> Bad })
                }
            }
        }
    }
}

// ------------------------------------------------------------------ Guide

@Composable
private fun GuideScreen(engine: TweakEngine, key: Int) {
    val clip = LocalClipboardManager.current
    @Suppress("UNUSED_VARIABLE") val k = key
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Header("Guide", "Version ${BuildConfig.VERSION_NAME} · updates install automatically") }
        item {
            Section("Unlock advanced tweaks", if (engine.hasAdvanced()) "Unlocked. Advanced tweaks are ready on the Tweaks tab." else "Android only lets an app change these settings after a one-time step from a computer. It's free and takes two minutes.") {
                if (!engine.hasAdvanced()) {
                    Text("1. On your phone: Settings → About phone → tap Build number 7 times. Then Settings → System → Developer options → turn on USB debugging.", color = Muted, fontSize = 13.sp)
                    Text("2. On your computer, install Android's free Platform Tools (search \"Android SDK Platform-Tools\") and plug your phone in. Allow the prompt on the phone.", color = Muted, fontSize = 13.sp)
                    Text("3. Run this command, then come back here:", color = Muted, fontSize = 13.sp)
                    Text(ADB_GRANT, color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Surface2, RoundedCornerShape(10.dp)).padding(10.dp))
                    OutlinedButton(onClick = { clip.setText(AnnotatedString(ADB_GRANT)) }) { Text("Copy command") }
                    Text("Using Shizuku? Run the same command (without \"adb shell\") in its terminal.", color = Muted, fontSize = 12.sp)
                }
            }
        }
        item {
            Section("Highest refresh rate", "Android doesn't let apps set this, but you can: Settings → Display → Smooth display / Refresh rate → highest. With a computer: adb shell settings put system peak_refresh_rate 120 (use your screen's maximum).") {}
        }
        item {
            Section("Before a match", null) {
                listOf(
                    "Close other apps (recent apps → Clear all) so your game gets the memory.",
                    "Use 5 GHz Wi-Fi close to the router; mobile data has more ping spikes.",
                    "Turn off Battery Saver while you play: it caps performance.",
                    "Keep the phone cool. Phones slow down when hot; take the case off for long sessions.",
                    "Turn on Game Mode (Home tab) and pick the lowest-ping region (Ping tab).",
                ).forEach { Text("• $it", color = Muted, fontSize = 13.sp) }
            }
        }
        item {
            Section("Safe by design", "Woof Tweaks only changes Android settings you could change yourself. Every original value is saved first; Revert puts it back exactly. No root needed, no data collected (only an anonymous install count).") {}
        }
    }
}
