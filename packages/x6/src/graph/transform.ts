import { Dom, NumberExt } from '../util'
import { Rectangle } from '../geometry'
import { Transform } from '../addon/transform'
import { Node } from '../model/node'
import { Base } from './base'

export class TransformManager extends Base {
  protected widgets: WeakMap<Node, Transform> = new WeakMap()
  protected viewportMatrix: DOMMatrix | null
  protected viewportTransformString: string | null

  protected get container() {
    return this.graph.view.container
  }

  protected get viewport() {
    return this.graph.view.viewport
  }

  protected get isSelectionEnabled() {
    return this.options.selecting.enabled === true
  }

  protected init() {
    this.setup()
    this.resize()
  }

  protected setup() {
    this.graph.on('node:mouseup', ({ node }) => {
      if (!this.isSelectionEnabled) {
        const widget = this.graph.hook.createTransform(node, { clearAll: true })
        if (widget) {
          this.widgets.set(node, widget)
        }
      }
    })

    this.graph.on('node:selected', ({ node }) => {
      if (this.isSelectionEnabled) {
        const widget = this.graph.hook.createTransform(node, {
          clearAll: false,
        })
        if (widget) {
          this.widgets.set(node, widget)
        }
      }
    })

    this.graph.on('node:unselected', ({ node }) => {
      if (this.isSelectionEnabled) {
        const widget = this.widgets.get(node)
        if (widget) {
          widget.dispose()
        }
        this.widgets.delete(node)
      }
    })
  }

  /**
   * Returns the current transformation matrix of the graph.
   */
  getMatrix() {
    const transform = this.viewport.getAttribute('transform')
    if (transform !== this.viewportTransformString) {
      // `getCTM`: top-left relative to the SVG element
      // `getScreenCTM`: top-left relative to the document
      this.viewportMatrix = this.viewport.getCTM()
      this.viewportTransformString = transform
    }

    // Clone the cached current transformation matrix.
    // If no matrix previously stored the identity matrix is returned.
    return Dom.createSVGMatrix(this.viewportMatrix)
  }

  /**
   * Sets new transformation with the given `matrix`
   */
  setMatrix(matrix: DOMMatrix | Dom.MatrixLike | null) {
    const ctm = Dom.createSVGMatrix(matrix)
    const transform = Dom.matrixToTransformString(ctm)
    this.viewport.setAttribute('transform', transform)
    this.viewportMatrix = ctm
    this.viewportTransformString = transform
  }

  resize(width?: number, height?: number) {
    const options = this.options
    let w = width === undefined ? options.width : width
    let h = height === undefined ? options.height : height

    options.width = w
    options.height = h

    if (typeof w === 'number') {
      w = Math.round(w)
    }
    if (typeof h === 'number') {
      h = Math.round(h)
    }

    this.container.style.width = w == null ? '' : `${w}px`
    this.container.style.height = h == null ? '' : `${h}px`

    const size = this.getComputedSize()
    this.graph.trigger('resize', { ...size })
    return this
  }

  getComputedSize() {
    const options = this.options
    let w = options.width
    let h = options.height
    if (!NumberExt.isNumber(w)) {
      w = this.container.clientWidth
    }
    if (!NumberExt.isNumber(h)) {
      h = this.container.clientHeight
    }
    return { width: w, height: h }
  }

  getScale() {
    return Dom.matrixToScale(this.getMatrix())
  }

  scale(sx: number, sy: number = sx, ox: number = 0, oy: number = 0) {
    sx = this.clampScale(sx) // tslint:disable-line
    sy = this.clampScale(sy) // tslint:disable-line

    if (ox || oy) {
      const ts = this.getTranslation()
      const tx = ts.tx - ox * (sx - 1)
      const ty = ts.ty - oy * (sy - 1)
      if (tx !== ts.tx || ty !== ts.ty) {
        this.translate(tx, ty)
      }
    }

    const matrix = this.getMatrix()
    matrix.a = sx
    matrix.d = sy

    this.setMatrix(matrix)
    this.graph.trigger('scale', { sx, sy, ox, oy })
    return this
  }

  clampScale(scale: number) {
    const range = this.graph.options.scaling
    return NumberExt.clamp(scale, range.min || 0.01, range.max || 16)
  }

  getRotation() {
    return Dom.matrixToRotation(this.getMatrix())
  }

  rotate(angle: number, cx?: number, cy?: number) {
    if (cx == null || cy == null) {
      const bbox = Dom.getBBox(this.graph.view.stage)
      cx = bbox.width / 2 // tslint:disable-line
      cy = bbox.height / 2 // tslint:disable-line
    }

    const ctm = this.getMatrix()
      .translate(cx, cy)
      .rotate(angle)
      .translate(-cx, -cy)
    this.setMatrix(ctm)
    return this
  }

  getTranslation() {
    return Dom.matrixToTranslation(this.getMatrix())
  }

  translate(tx: number, ty: number) {
    const matrix = this.getMatrix()
    matrix.e = tx || 0
    matrix.f = ty || 0

    this.setMatrix(matrix)

    const ts = this.getTranslation()
    const origin = this.options
    origin.x = ts.tx
    origin.y = ts.ty
    this.graph.trigger('translate', { ...ts })
    return this
  }

  setOrigin(ox?: number, oy?: number) {
    return this.translate(ox || 0, oy || 0)
  }

  fitToContent(
    gridWidth?: number | TransformManager.FitToContentFullOptions,
    gridHeight?: number,
    padding?: NumberExt.SideOptions,
    options?: TransformManager.FitToContentOptions,
  ) {
    if (typeof gridWidth === 'object') {
      const opts = gridWidth
      gridWidth = opts.gridWidth || 1 // tslint:disable-line
      gridHeight = opts.gridHeight || 1 // tslint:disable-line
      padding = opts.padding || 0 // tslint:disable-line
      options = opts // tslint:disable-line
    } else {
      gridWidth = gridWidth || 1 // tslint:disable-line
      gridHeight = gridHeight || 1 // tslint:disable-line
      padding = padding || 0 // tslint:disable-line
      if (options == null) {
        options = {} // tslint:disable-line
      }
    }

    const paddingValues = NumberExt.normalizeSides(padding)

    const area = options.contentArea
      ? Rectangle.create(options.contentArea)
      : this.getContentArea(options)

    const scale = this.getScale()
    const translate = this.getTranslation()
    const sx = scale.sx
    const sy = scale.sy

    area.x *= sx
    area.y *= sy
    area.width *= sx
    area.height *= sy

    let width =
      Math.max(Math.ceil((area.width + area.x) / gridWidth), 1) * gridWidth
    let height =
      Math.max(Math.ceil((area.height + area.y) / gridHeight), 1) * gridHeight

    let tx = 0
    let ty = 0

    if (
      (options.allowNewOrigin === 'negative' && area.x < 0) ||
      (options.allowNewOrigin === 'positive' && area.x >= 0) ||
      options.allowNewOrigin === 'any'
    ) {
      tx = Math.ceil(-area.x / gridWidth) * gridWidth
      tx += paddingValues.left
      width += tx
    }

    if (
      (options.allowNewOrigin === 'negative' && area.y < 0) ||
      (options.allowNewOrigin === 'positive' && area.y >= 0) ||
      options.allowNewOrigin === 'any'
    ) {
      ty = Math.ceil(-area.y / gridHeight) * gridHeight
      ty += paddingValues.top
      height += ty
    }

    width += paddingValues.right
    height += paddingValues.bottom

    // Make sure the resulting width and height are greater than minimum.
    width = Math.max(width, options.minWidth || 0)
    height = Math.max(height, options.minHeight || 0)

    // Make sure the resulting width and height are lesser than maximum.
    width = Math.min(width, options.maxWidth || Number.MAX_SAFE_INTEGER)
    height = Math.min(height, options.maxHeight || Number.MAX_SAFE_INTEGER)

    const size = this.getComputedSize()
    const sizeChanged = width !== size.width || height !== size.height
    const originChanged = tx !== translate.tx || ty !== translate.ty

    // Change the dimensions only if there is a size discrepency or an origin change
    if (originChanged) {
      this.translate(tx, ty)
    }

    if (sizeChanged) {
      this.resize(width, height)
    }

    return new Rectangle(-tx / sx, -ty / sy, width / sx, height / sy)
  }

  scaleContentToFit(options: TransformManager.ScaleContentToFitOptions = {}) {
    let contentBBox
    // let contentLocalOrigin
    if (options.contentArea) {
      const contentArea = options.contentArea
      contentBBox = this.graph.localToGraph(contentArea)
      // contentLocalOrigin = Point.create(contentArea)
    } else {
      contentBBox = this.getContentBBox(options)
      // contentLocalOrigin = this.graph.graphToLocalPoint(contentBBox)
    }

    if (!contentBBox.width || !contentBBox.height) {
      return
    }

    const padding = options.padding || 0
    const minScale = options.minScale || 0
    const maxScale = options.maxScale || Number.MAX_SAFE_INTEGER
    const minScaleX = options.minScaleX || minScale
    const maxScaleX = options.maxScaleX || maxScale
    const minScaleY = options.minScaleY || minScale
    const maxScaleY = options.maxScaleY || maxScale

    let fittingBBox
    if (options.viewportArea) {
      fittingBBox = options.viewportArea
    } else {
      const computedSize = this.getComputedSize()
      const currentTranslate = this.getTranslation()
      fittingBBox = {
        x: currentTranslate.tx,
        y: currentTranslate.ty,
        width: computedSize.width,
        height: computedSize.height,
      }
    }

    fittingBBox = Rectangle.create(fittingBBox).inflate(-padding)

    const currentScale = this.getScale()

    let newSx = (fittingBBox.width / contentBBox.width) * currentScale.sx
    let newSy = (fittingBBox.height / contentBBox.height) * currentScale.sy

    if (options.preserveAspectRatio !== false) {
      newSx = newSy = Math.min(newSx, newSy)
    }

    // snap scale to a grid
    const gridSize = options.scaleGrid
    if (gridSize) {
      newSx = gridSize * Math.floor(newSx / gridSize)
      newSy = gridSize * Math.floor(newSy / gridSize)
    }

    // scale min/max boundaries
    newSx = Math.min(maxScaleX, Math.max(minScaleX, newSx))
    newSy = Math.min(maxScaleY, Math.max(minScaleY, newSy))

    // const origin = this.options
    // const newOX = fittingBBox.x - contentLocalOrigin.x * newSx - origin.x
    // const newOY = fittingBBox.y - contentLocalOrigin.y * newSy - origin.y

    this.scale(newSx, newSy)
    // this.translate(newOX, newOY)
  }

  getContentArea(options: TransformManager.GetContentAreaOptions = {}) {
    if (options.useCellGeometry) {
      return this.model.getAllCellsBBox() || new Rectangle()
    }

    return Dom.getBBox(this.graph.view.stage)
  }

  getContentBBox(options: TransformManager.GetContentAreaOptions = {}) {
    return this.graph.localToGraph(this.getContentArea(options))
  }

  getGraphArea() {
    const rect = Rectangle.fromSize(this.getComputedSize())
    return this.graph.graphToLocal(rect)
  }
}

export namespace TransformManager {
  export interface FitToContentOptions extends GetContentAreaOptions {
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
    contentArea?: Rectangle | Rectangle.RectangleLike
    allowNewOrigin?: 'negative' | 'positive' | 'any'
  }

  export interface FitToContentFullOptions extends FitToContentOptions {
    gridWidth?: number
    gridHeight?: number
    padding?: NumberExt.SideOptions
  }

  export interface ScaleContentToFitOptions extends GetContentAreaOptions {
    padding?: number
    minScale?: number
    maxScale?: number
    minScaleX?: number
    minScaleY?: number
    maxScaleX?: number
    maxScaleY?: number
    scaleGrid?: number
    contentArea?: Rectangle.RectangleLike
    viewportArea?: Rectangle.RectangleLike
    preserveAspectRatio?: boolean
  }

  export interface GetContentAreaOptions {
    useCellGeometry?: boolean
  }
}
