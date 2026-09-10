package com.example.crisis.telecom

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log

/**
 * Android Telecom Framework ConnectionService for managed emergency VoIP/Cellular calling.
 */
class CrisisConnectionService : ConnectionService() {

    private val tag = "CrisisConnService"

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ): Connection {
        Log.i(tag, "onCreateOutgoingConnection requested for: ${request?.address}")

        val connection = object : Connection() {
            init {
                setAddress(request?.address, TelecomManager.PRESENTATION_ALLOWED)
                setInitializing()
                setActive()
            }

            override fun onCallAudioStateChanged(state: android.telecom.CallAudioState?) {
                super.onCallAudioStateChanged(state)
                Log.d(tag, "CallAudioStateChanged: route=${state?.route}")
            }

            override fun onDisconnect() {
                setDisconnected(android.telecom.DisconnectCause(android.telecom.DisconnectCause.LOCAL))
                destroy()
            }

            override fun onAbort() {
                setDisconnected(android.telecom.DisconnectCause(android.telecom.DisconnectCause.CANCELED))
                destroy()
            }
        }

        connection.setDialing()
        return connection
    }

    override fun onCreateOutgoingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?
    ) {
        super.onCreateOutgoingConnectionFailed(connectionManagerPhoneAccount, request)
        Log.e(tag, "onCreateOutgoingConnectionFailed for: ${request?.address}")
    }
}
