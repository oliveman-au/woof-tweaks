package stream.woofservices.tweaks

import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext

@Composable
fun AccountGate(engine: TweakEngine, changed: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var attempt by remember { mutableStateOf<Account.Login?>(null) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf(Account.error ?: "Sign in to use Woof Tweaks.") }
    LaunchedEffect(attempt) {
        val login = attempt ?: return@LaunchedEffect
        val loginContext = kotlin.coroutines.coroutineContext
        while (SystemClock.elapsedRealtime() < login.expiresAt) {
            delay(3000)
            val status = runCatching { withContext(Dispatchers.IO) { Account.poll(ctx, login) { attempt === login && loginContext.isActive } } }.getOrDefault("pending")
            if (status == "approved") { message = if (Account.authenticated()) "Signed in." else Account.error ?: "Reconnect to verify sign-in."; attempt = null; changed(); return@LaunchedEffect }
            if (status == "denied" || status == "expired") { message = "Sign-in $status. Please try again."; attempt = null; return@LaunchedEffect }
        }
        message = "The code expired. Please try again."; attempt = null
    }
    LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Text("YOUR WOOF ACCOUNT", color = Color(0xFFC2EF83), fontSize = 12.sp) }
        item { Text("Sign in. Get set.", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 32.sp) }
        item { Text("Your browser opens the Woof website. If you're already signed in there, approve the matching code to connect this phone.", color = Color(0xFFA7A9BE)) }
        item { Text("After verification, you have up to 15 minutes offline. Opening the app requires an online account check.", color = Color(0xFFA7A9BE)) }
        item { Text(attempt?.let { "Approve code ${it.code} in your browser." } ?: message, color = Color(0xFFFFB547)) }
        item {
            Button(enabled = !busy, onClick = {
                if (attempt != null) { attempt = null; message = "Sign-in cancelled." }
                else scope.launch {
                    busy = true
                    runCatching { withContext(Dispatchers.IO) { Account.begin(ctx) } }.onSuccess { login ->
                        attempt = login
                        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(login.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    }.onFailure { message = "Couldn't open sign-in. Check your connection and try again." }
                    busy = false
                }
            }, modifier = Modifier.fillMaxWidth()) { Text(if (attempt != null) "Cancel sign-in" else "Continue in browser") }
        }
        item { OutlinedButton(enabled = !busy, onClick = { scope.launch { busy = true; withContext(Dispatchers.IO) { Account.refresh(ctx) }; message = Account.error ?: "Please sign in."; changed(); busy = false } }, modifier = Modifier.fillMaxWidth()) { Text("Reconnect / check account") } }
        item { OutlinedButton(onClick = {
            engine.endSession()
            var failed = 0
            Tweaks.all.filter { engine.isApplied(it) }.forEach { if (engine.revert(it) != null) failed++ }
            message = if (failed == 0) "Previous changes restored." else "$failed changes still need Android permission to restore. Your backups are kept."
            changed()
        }, modifier = Modifier.fillMaxWidth()) { Text("Restore previous changes") } }
        item { TextButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Net.SITE + "/support")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }) { Text("Help & support") } }
    }
}
