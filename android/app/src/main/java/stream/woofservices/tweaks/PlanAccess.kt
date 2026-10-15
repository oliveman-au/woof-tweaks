package stream.woofservices.tweaks

/** Pure catalogue policy; Account supplies only its verified signed plan. */
object PlanAccess {
    val tiers = listOf("free", "good", "plus", "pro", "ultra", "lifetime")
    fun requiredPlan(id: String): String = when(id) {
        "screen-awake", "brightness-manual", "haptics-off", "touch-sounds-off" -> "good"
        "animations-fast" -> "plus"
        "wifi-scan-off", "ble-scan-off" -> "pro"
        "mobile-data-standby", "private-dns-cloudflare", "awake-charging" -> "ultra"
        "adaptive-battery-off" -> "lifetime"
        else -> "unavailable"
    }
    fun canUse(plan: String, id: String): Boolean {
        val have = tiers.indexOf(plan)
        val need = tiers.indexOf(requiredPlan(id))
        return have > 0 && need > 0 && have >= need
    }
}
