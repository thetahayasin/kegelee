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
         * The watch has its own version-code band, starting at 1000.
         *
         * It cannot share the phone's number: Play requires every artifact in a
         * listing to have a UNIQUE version code, whatever form factor it is
         * for, and the phone is already on 128. Matching them looked tidy and
         * would have been rejected at upload.
         *
         * A band rather than "the next free number" so the two counters never
         * collide again as the phone climbs - and so a code on its own says
         * which app it came from.
         */
        versionCode = 1002
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
            /**
             * The phone app's own keystore.properties, read where it already
             * lives.
             *
             * Not copied here, and no second file to keep in step: this reads
             * `react-native-app/android/keystore.properties` directly, so there
             * is exactly one place the release credentials exist and no chance
             * of the watch drifting onto a different key. A local
             * `wear-app/keystore.properties` still wins if one is present, for
             * a machine laid out differently.
             *
             * The key is not optional. Google Sign-In verifies the calling
             * app's package AND signing certificate against the OAuth client,
             * so a debug-signed build fails with DEVELOPER_ERROR however
             * correct the code is - and Play will not accept two differently
             * signed artifacts in one listing.
             */
            val local = rootProject.file("keystore.properties")
            val phone = rootProject.file("../react-native-app/android/keystore.properties")
            val propsFile = if (local.exists()) local else phone
            if (propsFile.exists()) {
                val props = Properties()
                props.load(propsFile.inputStream())
                // storeFile in the phone's file is relative to its app module.
                val base = if (propsFile == phone) {
                    rootProject.file("../react-native-app/android/app")
                } else {
                    rootProject.projectDir
                }
                storeFile = File(base, props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            /**
             * Debug builds are signed with the RELEASE key.
             *
             * Unusual, and necessary: Google Sign-In checks the signing
             * certificate against the OAuth client, so a debug-keystore build
             * cannot sign in at all - it fails with DEVELOPER_ERROR (status
             * 10), which looks like a code fault and is not one. Signing debug
             * with the same key is what makes the sign-in flow testable before
             * a release build exists.
             *
             * No applicationIdSuffix, for the same reason: the package is half
             * of what the OAuth client is registered against.
             */
            isMinifyEnabled = false
            val signed = rootProject.file("keystore.properties").exists() ||
                rootProject.file("../react-native-app/android/keystore.properties").exists()
            if (signed) signingConfig = signingConfigs.getByName("release")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val signed = rootProject.file("keystore.properties").exists() ||
                rootProject.file("../react-native-app/android/keystore.properties").exists()
            signingConfig = if (signed) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
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
