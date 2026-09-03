/**
 * Kegelee for Wear OS.
 *
 * A standalone Gradle build, deliberately not a module inside the phone app.
 * The two share nothing but a package name and a signing key, which is all the
 * Wearable Data Layer needs to pair them, so neither build can break the other
 * and the React Native toolchain never has to know this exists.
 */
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "kegelee-wear"
include(":app")
