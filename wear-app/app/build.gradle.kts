import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.kegelee.app.wear"

    /**
     * Compiled against the newest platform, installable on far older watches.
     *
     * compileSdk only decides which APIs the code may reference; minSdk decides
     * who can install it. Wear OS 3 (API 30) is the floor because that is where
     * Compose for Wear OS begins and where the current generation of watches
     * starts - Pixel Watch, Galaxy Watch 4 and everything after. Wear 2 devices
     * would need a different UI toolkit entirely and are not worth splitting the
     * app over.
     */
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        /**
         * The SAME applicationId as the phone app, and that is not optional.
         *
         * The Wearable Data Layer pairs a phone and a watch app by package name
         * and signing certificate. Change either and the two stop seeing each
         * other entirely - no error, no callback, just silence - and Play will
         * not deliver this from the phone app's listing.
         */
        applicationId = "com.kegelee.app"
        minSdk = 30
        targetSdk = 37

        /**
         * Tracks the phone app's own versionCode.
         *
         * Play treats the Wear artifact as a separate form factor of the same
         * listing, so the numbers do not have to match - but keeping them in
         * step means "which watch build shipped with which phone build" is a
         * question with an obvious answer instead of a spreadsheet.
         */
        versionCode = 128
        versionName = "1.0.111"
    }

    signingConfigs {
        /**
         * The phone app's release key, reused deliberately.
         *
         * Same reason as the applicationId: the Data Layer will not pair two
         * apps signed by different certificates. A debug-signed watch build
         * simply cannot talk to a release-signed phone build, which is a
         * genuinely confusing afternoon if you do not know it.
         */
        create("release") {
            val props = Properties()
            val propsFile = rootProject.file("keystore.properties")
            if (propsFile.exists()) {
                props.load(propsFile.inputStream())
                storeFile = rootProject.file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            // A distinct name only. NOT a distinct applicationId: an
            // applicationIdSuffix would break Data Layer pairing, which is the
            // one thing this app cannot work without.
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val props = rootProject.file("keystore.properties")
            signingConfig = if (props.exists()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
    buildFeatures {
        compose = true
        // BuildConfig.DEBUG gates the demo seed in DemoState.kt.
        buildConfig = true
    }
    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.wear.compose.material)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.wear.compose.navigation)

    implementation(libs.play.services.auth)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.kotlinx.serialization.json)
}
