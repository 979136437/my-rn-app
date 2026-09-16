package com.margelo.nitro.nitrolist

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

/** Nitrogen registers implementations relative to its generated Kotlin namespace. */
@Keep
@DoNotStrip
class HybridNitroListControllerRegistration : com.nitrolist.HybridNitroListController()
