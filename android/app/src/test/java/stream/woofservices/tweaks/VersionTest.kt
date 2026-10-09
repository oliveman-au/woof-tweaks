package stream.woofservices.tweaks

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionTest {
    @Test fun compares() {
        assertTrue(cmpVersion("1.1.10", "1.1.9") > 0)
        assertEquals(0, cmpVersion("1.2.0", "1.2.0"))
        assertTrue(cmpVersion("1.0.9", "1.1.0") < 0)
    }

    @Test fun tweaksAreWellFormed() {
        val ids = Tweaks.all.map { it.id }
        assertEquals(ids.size, ids.toSet().size)
        Tweaks.session.forEach { assertTrue(it, Tweaks.byId(it) != null) }
        Tweaks.all.forEach { assertTrue(it.id, it.changes.isNotEmpty()) }
    }
}
