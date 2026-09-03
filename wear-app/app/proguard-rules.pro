# kotlinx.serialization keeps its generated serializers on the companion; R8
# cannot see that reflectively and strips them, which fails at the first
# decode - i.e. the first time the phone sends anything.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.kegelee.app.wear.** {
    *** Companion;
}
-keepclasseswithmembers class com.kegelee.app.wear.** {
    kotlinx.serialization.KSerializer serializer(...);
}
