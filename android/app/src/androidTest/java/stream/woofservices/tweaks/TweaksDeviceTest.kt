package stream.woofservices.tweaks

import android.app.NotificationManager
import android.os.ParcelFileDescriptor
import android.provider.Settings
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Runs on a real Android emulator in CI: every tweak is applied, checked, reverted and checked again. */
@RunWith(AndroidJUnit4::class)
class TweaksDeviceTest {
    private val inst = InstrumentationRegistry.getInstrumentation()
    private val ctx = inst.targetContext

    private fun sh(cmd: String) {
        ParcelFileDescriptor.AutoCloseInputStream(inst.uiAutomation.executeShellCommand(cmd)).use { it.readBytes() }
    }

    private fun read(c: Change): String? = when (c.table) {
        Table.SYSTEM -> Settings.System.getString(ctx.contentResolver, c.key)
        Table.GLOBAL -> Settings.Global.getString(ctx.contentResolver, c.key)
        Table.SECURE -> Settings.Secure.getString(ctx.contentResolver, c.key)
    }

    @Before fun grant() {
        // What a user does once: allow "Modify system settings", Do Not Disturb access, and the adb grant.
        sh("appops set ${ctx.packageName} WRITE_SETTINGS allow")
        sh("pm grant ${ctx.packageName} android.permission.WRITE_SECURE_SETTINGS")
        sh("cmd notification allow_dnd ${ctx.packageName}")
    }

    @Test fun everyTweakAppliesAndRevertsExactly() {
        val e = TweakEngine(ctx)
        assertTrue(e.canWriteSettings())
        assertTrue(e.hasAdvanced())
        var applied = 0
        for (t in Tweaks.all) {
            if (e.isApplied(t)) e.revert(t)
            val before = t.changes.map { read(it) }
            val err = e.apply(t)
            if (err != null && err.startsWith("Not supported")) continue // this Android build ignores the key
            assertNull("${t.id}: $err", err)
            assertTrue(t.id, e.isApplied(t))
            assertTrue(t.id, e.isAtTarget(t))
            applied++
            assertNull(t.id, e.revert(t))
            val after = t.changes.map { read(it) }
            before.zip(after).forEachIndexed { i, (b, a) ->
                assertTrue("${t.id} ${t.changes[i].key}: was $b, now $a", b == null || b == a || b.toFloatOrNull() == a?.toFloatOrNull())
            }
        }
        assertTrue("only $applied tweaks could be applied", applied >= Tweaks.all.size - 3)
    }

    @Test fun gameModeTurnsEverythingBackOff() {
        val e = TweakEngine(ctx)
        if (e.sessionActive()) e.endSession()
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val filter = nm.currentInterruptionFilter
        val before = Tweaks.session.mapNotNull { Tweaks.byId(it) }.flatMap { t -> t.changes.map { read(it) } }
        assertTrue(e.startSession(dnd = true) > 0)
        assertTrue(e.sessionActive())
        assertEquals("600000", Settings.System.getString(ctx.contentResolver, Settings.System.SCREEN_OFF_TIMEOUT))
        e.endSession()
        val after = Tweaks.session.mapNotNull { Tweaks.byId(it) }.flatMap { t -> t.changes.map { read(it) } }
        assertEquals(before, after)
        assertEquals(filter, nm.currentInterruptionFilter)
    }

    @Test fun appOpensWithoutCrashing() {
        ActivityScenario.launch(MainActivity::class.java).use { Thread.sleep(3000) }
    }
}
