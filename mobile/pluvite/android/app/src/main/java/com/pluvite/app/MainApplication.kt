package com.pluvite.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    criarCanalAlertas()
    loadReactNative(this)
  }

  private fun criarCanalAlertas() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val canal = NotificationChannel(
      "alertas-emergencia",
      getString(com.pluvite.app.R.string.alertas_canal_nome),
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = getString(com.pluvite.app.R.string.alertas_canal_descricao)
      enableVibration(true)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
  }
}
