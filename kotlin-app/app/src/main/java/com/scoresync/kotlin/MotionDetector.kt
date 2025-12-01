package com.scoresync.kotlin

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import java.nio.ByteBuffer
import kotlin.math.abs

class MotionDetector(
    private val onMotionDetected: (Float) -> Unit,
) : ImageAnalysis.Analyzer {
    private var previousBuffer: ByteBuffer? = null
    private var width = 0
    private var height = 0

    // Configuration
    var sensitivity: Int = 30
    var step: Int = 2 // Process every Nth pixel
    var zone: Zone? = null // Normalized coordinates (0.0 - 1.0)

    data class Zone(
        val x: Float,
        val y: Float,
        val width: Float,
        val height: Float,
    )

    override fun analyze(image: ImageProxy) {
        val currentBuffer = image.planes[0].buffer

        // Initialize on first frame or size change
        if (previousBuffer == null || width != image.width || height != image.height) {
            width = image.width
            height = image.height
            previousBuffer = ByteBuffer.allocateDirect(currentBuffer.capacity())
            previousBuffer?.put(currentBuffer)
            currentBuffer.rewind() // Rewind for next usage if needed, though we copied it
            image.close()
            return
        }

        val prev = previousBuffer!!
        currentBuffer.rewind()
        prev.rewind()

        var changedPixels = 0
        var totalZonePixels = 0

        // Calculate zone boundaries in pixels
        val z = zone
        val startX = if (z != null) (z.x * width).toInt().coerceIn(0, width - 1) else 0
        val startY = if (z != null) (z.y * height).toInt().coerceIn(0, height - 1) else 0
        val endX = if (z != null) ((z.x + z.width) * width).toInt().coerceIn(0, width) else width
        val endY = if (z != null) ((z.y + z.height) * height).toInt().coerceIn(0, height) else height

        // Pixel stride (usually 1 for Y plane in YUV_420_888)
        val pixelStride = image.planes[0].pixelStride
        val rowStride = image.planes[0].rowStride

        for (y in startY until endY step step) {
            for (x in startX until endX step step) {
                val index = y * rowStride + x * pixelStride

                // Simple difference check on Y channel (luminance)
                // Note: This is a simplification. For better results, we might need RGB conversion
                // but Y channel difference is often sufficient for motion.
                val currVal = currentBuffer.get(index).toInt() and 0xFF
                val prevVal = prev.get(index).toInt() and 0xFF

                if (abs(currVal - prevVal) > sensitivity) {
                    changedPixels++
                }
                totalZonePixels++
            }
        }

        // Update previous buffer
        currentBuffer.rewind()
        prev.clear()
        prev.put(currentBuffer)

        if (totalZonePixels > 0) {
            val motionRatio = changedPixels.toFloat() / totalZonePixels
            onMotionDetected(motionRatio)
        }

        image.close()
    }
}
