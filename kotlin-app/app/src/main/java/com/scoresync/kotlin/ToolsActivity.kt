package com.scoresync.kotlin

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

class ToolsActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            ToolsScreen(
                onMotionGateClick = {
                    startActivity(Intent(this, MotionGateActivity::class.java))
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolsScreen(onMotionGateClick: () -> Unit) {
    val backgroundColor = Color(0xFF121212)
    val cardBackgroundColor = Color(0xFF1E1E1E)
    val accentColor = Color(0xFF3B82F6)
    val textColor = Color(0xFFFFFFFF)
    val secondaryTextColor = Color(0xFFB0B0B0)

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(backgroundColor)
                .padding(16.dp),
    ) {
        Text(
            text = "Tools",
            color = textColor,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
        )

        Spacer(modifier = Modifier.height(24.dp))

        Card(
            onClick = onMotionGateClick,
            colors = CardDefaults.cardColors(containerColor = cardBackgroundColor),
            shape = RoundedCornerShape(12.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier =
                    Modifier
                        .padding(16.dp)
                        .fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(
                    painter = painterResource(android.R.drawable.ic_menu_camera),
                    contentDescription = null,
                    colorFilter = ColorFilter.tint(accentColor),
                    modifier = Modifier.size(24.dp),
                )

                Column(
                    modifier =
                        Modifier
                            .weight(1f)
                            .padding(start = 16.dp),
                ) {
                    Text(
                        text = "Motion Gate",
                        color = textColor,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "Optical Tripwire & Timing Systems",
                        color = secondaryTextColor,
                        fontSize = 12.sp,
                    )
                }

                Image(
                    painter = painterResource(android.R.drawable.ic_media_play),
                    contentDescription = null,
                    colorFilter = ColorFilter.tint(secondaryTextColor),
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true)
@Composable
fun ToolsScreenPreview() {
    ToolsScreen(onMotionGateClick = {})
}
