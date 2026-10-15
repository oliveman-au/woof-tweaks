package stream.woofservices.tweaks
import org.junit.Assert.*
import org.junit.Test
class PlanAccessTest {
    @Test fun unpaidAndUnknownCannotUnlock() {
        for (plan in listOf("free", "fake")) assertFalse(PlanAccess.canUse(plan,"screen-awake"))
        assertFalse(PlanAccess.canUse("lifetime","unknown-tweak"))
    }
    @Test fun tiersUnlockProgressively() {
        assertTrue(PlanAccess.canUse("good","screen-awake"))
        assertFalse(PlanAccess.canUse("good","animations-fast"))
        assertTrue(PlanAccess.canUse("plus","animations-fast"))
        assertFalse(PlanAccess.canUse("plus","wifi-scan-off"))
        assertTrue(PlanAccess.canUse("pro","wifi-scan-off"))
        assertFalse(PlanAccess.canUse("pro","private-dns-cloudflare"))
        assertTrue(PlanAccess.canUse("ultra","private-dns-cloudflare"))
        assertFalse(PlanAccess.canUse("ultra","adaptive-battery-off"))
        assertTrue(PlanAccess.canUse("lifetime","adaptive-battery-off"))
    }
}
