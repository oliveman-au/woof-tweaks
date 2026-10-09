import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// The Android app ships with every Woof Tweaks release and carries the same version as the desktop app.
val desktopVersion = (JsonSlurper().parse(rootProject.file("../package.json")) as Map<*, *>)["version"] as String
val parts = desktopVersion.split(".").map { it.toInt() }

android {
    namespace = "stream.woofservices.tweaks"
    compileSdk = 35

    defaultConfig {
        applicationId = "stream.woofservices.tweaks"
        minSdk = 26
        targetSdk = 35
        versionName = desktopVersion
        versionCode = parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Release signing key comes from CI secrets (never in the repo). The same key must sign every version,
    // or Android refuses the update.
    val ks = System.getenv("WOOF_ANDROID_KEYSTORE")
    signingConfigs {
        if (ks != null) create("release") {
            storeFile = file(ks)
            storeType = "pkcs12"
            storePassword = System.getenv("WOOF_ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("WOOF_ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("WOOF_ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (ks != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
    lint { abortOnError = false; checkReleaseBuilds = false; disable += setOf("ProtectedPermissions", "QueryAllPackagesPermission", "OldTargetApi", "GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion") }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(bom)
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material:material-icons-core")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
