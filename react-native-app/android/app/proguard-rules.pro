# ============================================================================
# Kegelee - R8 / ProGuard keep rules (release builds)
#
# R8 runs in full mode (minify + resource shrink + obfuscate). Most third-party
# React Native libraries ship their own consumer rules inside their AARs, so the
# rules below are defensive keeps for the pieces R8 can't infer via reflection.
# ============================================================================

# --- React Native core / Hermes / JNI --------------------------------------
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**

# Keep native module methods invoked from JS via reflection.
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }
-keep,includedescriptorclasses class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep,includedescriptorclasses class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }

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
-keep class app.notifee.** { *; }
-keep class io.invertase.notifee.** { *; }
-dontwarn app.notifee.**

# --- Google Sign-In / Play Services ----------------------------------------
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
-keep class com.google.android.gms.common.api.internal.** { *; }

# --- react-native-svg -------------------------------------------------------
-keep public class com.horcrux.svg.** { *; }

# --- react-native-screens / gesture-handler --------------------------------
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# --- react-native-sqlite-storage -------------------------------------------
-keep class org.pgsqlite.** { *; }
-keep class io.liteglue.** { *; }

# --- AsyncStorage / vector-icons / haptics / keep-awake --------------------
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# --- General Android safety nets -------------------------------------------
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-keepnames class * implements java.io.Serializable
