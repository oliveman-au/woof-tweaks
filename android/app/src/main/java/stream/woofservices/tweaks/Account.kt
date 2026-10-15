package stream.woofservices.tweaks

import android.content.Context
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.crypto.tink.subtle.Ed25519Verify
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** A fresh online check is required for each process. Offline proof is signed and never persisted. */
object Account {
    private const val ALIAS = "woof-account-v1"
    private val verifier = Ed25519Verify(Base64.decode("I73M/RXqL3Qd9B9/sCScFrDsouUAfLX5wQYsrHC5nEQ=", Base64.DEFAULT))
    @Volatile private var deadline = 0L
    @Volatile private var expiresAt = 0L
    @Volatile var name: String? = null
        private set
    @Volatile var error: String? = null
        private set

    @Volatile private var signedPlan = "free"
    fun plan(): String = if (authenticated()) signedPlan else "free"
    fun entitled(): Boolean = authenticated() && plan() in listOf("good", "plus", "pro", "ultra", "lifetime")
    fun requiredPlan(id: String): String = PlanAccess.requiredPlan(id)
    fun canUse(id: String): Boolean = entitled() && PlanAccess.canUse(plan(), id)
    fun authenticated(): Boolean = deadline > SystemClock.elapsedRealtime() && expiresAt > System.currentTimeMillis()
    private fun clearLease() { deadline = 0L; expiresAt = 0L; signedPlan = "free" }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun token(ctx: Context): String? = runCatching {
        val saved = ctx.getSharedPreferences("woof-account", Context.MODE_PRIVATE).getString("token", null) ?: return null
        val p = saved.split(':'); require(p.size == 2)
        Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP))) }
            .doFinal(Base64.decode(p[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }.getOrNull()
    private fun saveToken(ctx: Context, token: String) {
        clearLease()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val saved = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP)
        ctx.getSharedPreferences("woof-account", Context.MODE_PRIVATE).edit().putString("token", saved).apply()
    }
    private fun accept(ctx: Context, value: String): Boolean = runCatching {
        require(value.length <= 4000)
        val parts = value.split('.'); require(parts.size == 2 && parts.all { it.matches(Regex("[A-Za-z0-9_-]+")) })
        verifier.verify(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP), parts[0].toByteArray(Charsets.US_ASCII))
        val c = JSONObject(String(Base64.decode(parts[0], Base64.URL_SAFE or Base64.NO_WRAP), Charsets.UTF_8))
        val now = System.currentTimeMillis() / 1000
        val issued = c.getLong("iat"); val exp = c.getLong("exp")
        require(c.getString("typ") == "woof-session-v1" && c.getString("app") == "tweaks" && c.getString("device") == Net.deviceId(ctx))
        require(c.getLong("sub") > 0 && exp - issued == 900L && issued <= now + 30 && exp > now)
        val verifiedPlan = c.getString("plan")
        require(verifiedPlan in listOf("free", "good", "plus", "pro", "ultra", "lifetime"))
        signedPlan = verifiedPlan
        expiresAt = exp * 1000
        deadline = SystemClock.elapsedRealtime() + minOf(900000L, (exp - now) * 1000)
        true
    }.getOrDefault(false)

    /** Called from a worker thread, never blocks the UI. Transient errors preserve only the remaining signed lease. */
    @Synchronized fun refresh(ctx: Context) {
        val credential = token(ctx)
        if (credential == null) { clearLease(); return }
        try {
            val response = Net.post("/api/app/license", JSONObject().put("token", credential).put("deviceId", Net.deviceId(ctx)).put("platform", "android").put("appVersion", BuildConfig.VERSION_NAME))
            if (credential != token(ctx)) return
            if (!response.optBoolean("signedIn")) {
                clearLease(); ctx.getSharedPreferences("woof-account", Context.MODE_PRIVATE).edit().remove("token").apply()
                error = "Your sign-in expired. Please sign in again."; return
            }
            if (!accept(ctx, response.optString("authLease"))) { clearLease(); error = "Could not verify your account. Reconnect and try again."; return }
            name = response.optString("name").takeUnless { it.isBlank() || it == "null" }; error = null
        } catch (_: Exception) { error = "Can't reach Woof right now. A verified session lasts up to 15 minutes offline." }
    }
    fun signOut(ctx: Context) {
        val current = token(ctx); clearLease(); name = null
        ctx.getSharedPreferences("woof-account", Context.MODE_PRIVATE).edit().remove("token").apply()
        if (current != null) runCatching { Net.post("/api/app/logout", JSONObject().put("token", current)) }
    }
    data class Login(val code: String, val url: String, val pollToken: String, val expiresAt: Long)
    fun begin(ctx: Context): Login {
        val r = Net.post("/api/app/link/start", JSONObject().put("deviceId", Net.deviceId(ctx)).put("platform", "android").put("appVersion", BuildConfig.VERSION_NAME).put("app", "tweaks"))
        require(r.optBoolean("ok")) { "Could not start sign-in." }
        val url = r.getString("url"); require(url.startsWith(Net.SITE + "/app/link?code="))
        return Login(r.getString("code"), url, r.getString("pollToken"), SystemClock.elapsedRealtime() + 600000)
    }
    fun poll(ctx: Context, attempt: Login, active: () -> Boolean = { true }): String {
        if (!active()) return "cancelled"
        if (SystemClock.elapsedRealtime() >= attempt.expiresAt) return "expired"
        val r = Net.post("/api/app/link/poll", JSONObject().put("pollToken", attempt.pollToken))
        if (!active()) {
            r.optString("token").takeIf { it.isNotBlank() }?.let { runCatching { Net.post("/api/app/logout", JSONObject().put("token", it)) } }
            return "cancelled"
        }
        val status = r.optString("status", "pending")
        if (status == "approved") { saveToken(ctx, r.getString("token")); refresh(ctx); if (!active()) {
            val approved = r.getString("token")
            if (token(ctx) == approved) { clearLease(); ctx.getSharedPreferences("woof-account", Context.MODE_PRIVATE).edit().remove("token").apply() }
            runCatching { Net.post("/api/app/logout", JSONObject().put("token", approved)) }
            return "cancelled"
        } }
        return status
    }
}
