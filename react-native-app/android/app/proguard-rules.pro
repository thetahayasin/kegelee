# ============================================================================
# Kegelee - R8 / ProGuard keep rules (release builds)
#
# R8 runs in full mode (minify + resource shrink + obfuscate). Most third-party
# React Native libraries ship their own consumer rules inside their AARs, so the
# rules below are only for the pieces R8 cannot infer via reflection.
#
# The rule to remember when editing this file: a blanket `-keep class pkg.** {
# *; }` does not make the build safer, it makes R8 blind. It was costing this
# app real size - `com.facebook.react.**` and `com.google.android.gms.**`
# together pinned ~34k of 81k kept seeds, none of which R8 was then allowed to
# shrink, inline or optimise. Both libraries already ship precise consumer
# rules; duplicating them badly was strictly worse than trusting them.
# ============================================================================

# --- React Native core / Hermes / JNI --------------------------------------
# NOT `-keep class com.facebook.react.** { *; }`. React Native ships
# ReactAndroid/proguard-rules.pro as consumerProguardFiles, and it is both more
# precise and more complete than anything written here: @DoNotStrip and
# @DoNotStripAny (facebook.proguard AND facebook.jni variants), all native
# <methods>, @ReactProp / @ReactPropGroup, every NativeModule and
# JavaScriptModule implementor, and bridge/turbomodule kept whole. Yoga,
# fresco imageutils and okio are covered there too.
#
# What is left here is the Hermes engine, whose JNI surface is reached from
# C++ rather than through an annotation R8 can see.
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**

# --- Kotlin -----------------------------------------------------------------
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings { <fields>; }

# --- OkHttp / Okio (RN networking) -----------------------------------------
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# --- Notifee (reminders) ----------------------------------------------------
# Ships as a prebuilt AAR whose workers and receivers are resolved by name from
# the manifest and from WorkManager, so this one stays broad.
-keep class app.notifee.** { *; }
-keep class io.invertase.notifee.** { *; }
-dontwarn app.notifee.**

# --- Google Sign-In / Play Services ----------------------------------------
# Scoped to what this app actually links: the sign-in flow and the shared
# base/common classes it needs. The blanket gms keep also pinned maps, ads,
# measurement and the rest of Play Services that this app never calls.
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.api.** { *; }
-dontwarn com.google.android.gms.**

# --- react-native-svg -------------------------------------------------------
-keep public class com.horcrux.svg.** { *; }

# --- react-native-screens / gesture-handler --------------------------------
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# --- react-native-sqlite-storage -------------------------------------------
-keep class org.pgsqlite.** { *; }
-keep class io.liteglue.** { *; }

# --- AsyncStorage -----------------------------------------------------------
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# --- General Android safety nets -------------------------------------------
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable
# Stack traces stay de-obfuscatable through mapping.txt; the original file
# names do not need to ship in the APK to make that work.
-renamesourcefileattribute SourceFile
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-keepnames class * implements java.io.Serializable
