package stream.woofservices.tweaks

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent

/**
 * Keeps Woof Tweaks up to date without opening it: a background job every 6 hours (kept across restarts) plus one
 * shortly after the phone starts. It downloads, verifies and installs the update; once Woof Tweaks has installed
 * itself once, Android 12+ does this silently.
 */
class UpdateJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            runCatching { if (Updater.canInstall(this)) Updater.check()?.let { Updater.downloadAndInstall(this, it) } }
            jobFinished(params, false)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters) = true

    companion object {
        private const val PERIODIC = 4201
        private const val AFTER_BOOT = 4202

        fun schedule(ctx: Context) {
            val js = ctx.getSystemService(JobScheduler::class.java) ?: return
            if (js.getPendingJob(PERIODIC) == null) {
                js.schedule(
                    JobInfo.Builder(PERIODIC, ComponentName(ctx, UpdateJobService::class.java))
                        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                        .setPeriodic(6 * 60 * 60 * 1000L)
                        .setPersisted(true)
                        .build(),
                )
            }
        }

        fun runSoon(ctx: Context) {
            val js = ctx.getSystemService(JobScheduler::class.java) ?: return
            js.schedule(
                JobInfo.Builder(AFTER_BOOT, ComponentName(ctx, UpdateJobService::class.java))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setMinimumLatency(60_000L)
                    .setOverrideDeadline(30 * 60_000L)
                    .build(),
            )
        }
    }
}

/** Phone started: check for an update shortly, and make sure the 6-hourly job exists. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            UpdateJobService.schedule(ctx)
            if (intent.action == Intent.ACTION_BOOT_COMPLETED) UpdateJobService.runSoon(ctx)
        }
    }
}
