package com.scoresync.kotlin

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class LanDiscovery(context: Context) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val SERVICE_TYPE = "_scoresync._tcp."
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    private val _discoveredServices = MutableStateFlow<List<NsdServiceInfo>>(emptyList())
    val discoveredServices = _discoveredServices.asStateFlow()

    fun registerService(
        port: Int,
        lobbyId: String,
    ) {
        val serviceInfo =
            NsdServiceInfo().apply {
                serviceName = "ScoreSync-$lobbyId"
                serviceType = SERVICE_TYPE
                setPort(port)
            }

        registrationListener =
            object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(NsdServiceInfo: NsdServiceInfo) {
                    Log.d("LanDiscovery", "Service registered: ${NsdServiceInfo.serviceName}")
                }

                override fun onRegistrationFailed(
                    serviceInfo: NsdServiceInfo,
                    errorCode: Int,
                ) {
                    Log.e("LanDiscovery", "Registration failed: $errorCode")
                }

                override fun onServiceUnregistered(arg0: NsdServiceInfo) {}

                override fun onUnregistrationFailed(
                    serviceInfo: NsdServiceInfo,
                    errorCode: Int,
                ) {}
            }

        nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener)
    }

    fun unregisterService() {
        registrationListener?.let {
            try {
                nsdManager.unregisterService(it)
            } catch (e: Exception) {
                Log.e("LanDiscovery", "Error unregistering service", e)
            }
        }
        registrationListener = null
    }

    fun startDiscovery() {
        _discoveredServices.value = emptyList()

        discoveryListener =
            object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(regType: String) {
                    Log.d("LanDiscovery", "Service discovery started")
                }

                override fun onServiceFound(service: NsdServiceInfo) {
                    Log.d("LanDiscovery", "Service found: $service")
                    if (service.serviceType.contains("_scoresync")) {
                        nsdManager.resolveService(
                            service,
                            object : NsdManager.ResolveListener {
                                override fun onResolveFailed(
                                    serviceInfo: NsdServiceInfo,
                                    errorCode: Int,
                                ) {
                                    Log.e("LanDiscovery", "Resolve failed: $errorCode")
                                }

                                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                                    Log.d("LanDiscovery", "Resolve Succeeded. $serviceInfo")
                                    val current = _discoveredServices.value.toMutableList()
                                    // Avoid duplicates
                                    if (current.none { it.serviceName == serviceInfo.serviceName }) {
                                        current.add(serviceInfo)
                                        _discoveredServices.value = current
                                    }
                                }
                            },
                        )
                    }
                }

                override fun onServiceLost(service: NsdServiceInfo) {
                    Log.e("LanDiscovery", "service lost: $service")
                    val current = _discoveredServices.value.toMutableList()
                    current.removeAll { it.serviceName == service.serviceName }
                    _discoveredServices.value = current
                }

                override fun onDiscoveryStopped(serviceType: String) {}

                override fun onStartDiscoveryFailed(
                    serviceType: String,
                    errorCode: Int,
                ) {
                    Log.e("LanDiscovery", "Discovery failed: $errorCode")
                    nsdManager.stopServiceDiscovery(this)
                }

                override fun onStopDiscoveryFailed(
                    serviceType: String,
                    errorCode: Int,
                ) {
                    nsdManager.stopServiceDiscovery(this)
                }
            }

        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
    }

    fun stopDiscovery() {
        discoveryListener?.let {
            try {
                nsdManager.stopServiceDiscovery(it)
            } catch (e: Exception) {
                Log.e("LanDiscovery", "Error stopping discovery", e)
            }
        }
        discoveryListener = null
    }
}
