package com.kegelee.app

import android.app.Application
import android.content.res.Configuration
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.common.assets.ReactFontManager
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Native Clock-alarm reminders (AlarmClock.ACTION_SET_ALARM).
          add(AlarmPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // The brand typeface. Two families so React Native can pick each file by
    // fontWeight: "Archivo" for body text, "ArchivoExpanded" for headings.
    ReactFontManager.getInstance().addCustomFont(this, "Archivo", R.font.archivo)
    ReactFontManager.getInstance().addCustomFont(this, "ArchivoExpanded", R.font.archivo_expanded)
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
