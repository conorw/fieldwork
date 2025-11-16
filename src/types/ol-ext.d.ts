declare module 'ol-ext/interaction/Transform' {
  import { Interaction } from 'ol/interaction'
  import { Collection } from 'ol/Collection'
  import { Feature } from 'ol/Feature'
  import { Geometry } from 'ol/geom'

  interface TransformOptions {
    enableRotation?: boolean
    scale?: boolean
    rotate?: boolean
    translate?: boolean
    stretch?: boolean
    pixelTolerance?: number
    hitTolerance?: number
    keepAspectRatio?: boolean
    noFlip?: boolean
  }

  class Transform extends Interaction {
    constructor(options?: TransformOptions)
    getFeatures(): Collection<Feature<Geometry>>
    setActive(active: boolean): void
    getActive(): boolean
    on(type: string, listener: (event: any) => void): void
  }

  export default Transform
}
