package com.kegelee.app.wear

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState

/**
 * The scrollbar every scrollable Wear screen is required to have.
 *
 * Play rejected an update under the Wear OS quality guidelines for a missing
 * scroll indicator, and it was right: there was not a single PositionIndicator
 * in this app. Wear's Scaffold only draws one if it is handed a
 * `positionIndicator`, and ours passed `timeText = {}` and nothing else, so six
 * ScalingLazyColumn screens scrolled with no indication of how far down they
 * were or that there was anything below the fold at all.
 *
 * The awkward part is that the Scaffold lives once, at the top of WearApp,
 * while the list state that drives the indicator is created inside whichever
 * screen is currently showing. So the state has to travel UP. A single
 * Scaffold with a hoisted state is the right shape here rather than a Scaffold
 * per screen: nesting them would draw two vignettes and two time slots, and
 * the outer one is already positioned and themed.
 *
 * Screens do not interact with any of this beyond swapping one call:
 * `rememberScalingLazyListState()` becomes `rememberIndicatedListState()`.
 */
val LocalScrollIndicator: ProvidableCompositionLocal<MutableState<ScalingLazyListState?>> =
    compositionLocalOf {
        // Screens are only ever composed inside ProvideScrollIndicator. A
        // default that silently swallowed the registration would give us the
        // exact bug this file exists to fix, and it would look like it worked.
        error("No ScrollIndicator holder. Wrap the screen in ProvideScrollIndicator.")
    }

/**
 * Holds the active screen's scroll position for the Scaffold above it.
 *
 * One slot, not a stack: exactly one screen is on a watch at a time, and
 * `when` in WearApp composes exactly one branch.
 */
@Composable
fun ProvideScrollIndicator(content: @Composable (MutableState<ScalingLazyListState?>) -> Unit) {
    val holder = remember { mutableStateOf<ScalingLazyListState?>(null) }
    CompositionLocalProvider(LocalScrollIndicator provides holder) { content(holder) }
}

/**
 * A list state that also shows a scrollbar while its screen is on.
 *
 * The registration is a DisposableEffect rather than a plain assignment so the
 * indicator follows navigation: leaving a screen clears the slot, and a screen
 * that does not scroll (the session and its done screen) leaves it empty, so
 * no indicator is drawn over content that has nothing to scroll.
 *
 * The `===` on dispose matters. Compose can build the incoming screen before
 * it tears down the outgoing one, so the departing screen's cleanup would
 * otherwise wipe a slot the arriving screen had already claimed, and the new
 * screen would scroll with no indicator.
 */
@Composable
fun rememberIndicatedListState(initialCenterItemIndex: Int = 1): ScalingLazyListState {
    val state = rememberScalingLazyListState(initialCenterItemIndex = initialCenterItemIndex)
    val holder = LocalScrollIndicator.current

    DisposableEffect(state) {
        holder.value = state
        onDispose { if (holder.value === state) holder.value = null }
    }

    return state
}
