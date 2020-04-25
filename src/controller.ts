import { Subject, BehaviorSubject } from 'rxjs'
import { tap, filter, map, distinctUntilChanged, pluck } from 'rxjs/operators'

import { edgeRoi, labelRoi, display, imshow, setVal, growValley, composeDisplay, dimBy, initMats, setRoi, ComposeConfig, outputLabel } from './model'

type Roi = {
    x: number,
    y: number,
    width: number,
    height: number,
}

type ComposeUpdate = {
    showBg?: boolean
    bgWeight?: number,
    showEdge?: boolean,
    showEdgeValley?: boolean,
    edgeWeight?: number,
    showLabel?: boolean,
    labelColor?: number[],
    labelWeight?: number,
}

type RoiUpdate = {
    isInit?: boolean,
    isResize?: boolean,
    roi: Roi,
}

type DataUpdate = {
    isUndo?: boolean,
    targets?: number[][],
    isSet?: boolean,
}

type DisplayUpdate = {
    targets?: number[][],
    color?: number[],
    dimBy?: number,
}

type DataUpdateUndo = {
    update: Subject<DataUpdate>,
    roi: Roi,
    targets: number[][],
    isSet: boolean,
}

const DEFAULT_ROI_RANGE = {
    width: [16, 800],
    height: [16, 800],
}

export const getRoiRange = () => RoiRange

export const DEFAULT_COMPOSE: ComposeConfig = {
    showBg: true,
    bgWeight: 1,
    showEdge: true,
    showEdgeValley: false,
    edgeWeight: 0.4,
    showLabel: true,
    labelColor: [255, 255, 0, 255],
    labelWeight: 0.8,
}

export const composeUpdate = new Subject<ComposeUpdate>()
export const composeStore = new BehaviorSubject<ComposeConfig>(DEFAULT_COMPOSE)
export const roiUpdate = new Subject<RoiUpdate>()
export const roiStore = new BehaviorSubject<Roi>({ width: -1, height: -1, x: -1, y: -1 })
export const initedStore = new BehaviorSubject<boolean>(false)

export const srcUpdate = new Subject<HTMLImageElement>()
export const edgeUpdate = new Subject<DataUpdate>()
export const labelUpdate = new Subject<DataUpdate>()
export const displayUpdate = new Subject<DisplayUpdate>()

var SrcSize = {
    width: 0,
    height: 0,
}

var RoiRange = {
    width: [0, 0],
    height: [0, 0],
}

var hist: DataUpdateUndo[]

export const undo = () => {
    const h = hist.pop()
    if (!h) return
    roiUpdate.next({ roi: h.roi })
    h.update.next({ ...h, isUndo: true })
}

const fitRange = (r: number[], n: number) => n < r[0] ? r[0] : (n > r[1] ? r[1] : n)

const restrictRoi = (roi: Roi) => {
    const w = fitRange(RoiRange.width, roi.width), h = fitRange(RoiRange.height, roi.height)
    return {
        width: w,
        height: h,
        x: fitRange([0, SrcSize.width - w - 1], roi.x),
        y: fitRange([0, SrcSize.height - h - 1], roi.y),
    }
}

const invalidResize = (update: RoiUpdate) =>
    update.isResize && (update.roi.width < RoiRange.width[0] || update.roi.width > RoiRange.width[1] || update.roi.height < RoiRange.height[0] || update.roi.height > RoiRange.height[1])

composeUpdate
    .pipe(
        filter(() => initedStore.value),
    )
    .subscribe(update => composeStore.next({ ...composeStore.value, ...update }))
composeStore
    .subscribe(() => displayUpdate.next({}))

roiUpdate
    .pipe(
        filter(update => !invalidResize(update)),
        map(update => ({ ...update, roi: restrictRoi(update.roi) })),
        distinctUntilChanged((prev, curr) => !curr.isInit && JSON.stringify(prev.roi) === JSON.stringify(curr.roi)),
        pluck("roi"),
        tap(setRoi)
    )
    .subscribe(roi => roiStore.next(roi))
roiStore
    .subscribe(() => edgeUpdate.next({}))

srcUpdate
    .pipe(
        tap(() => initedStore.next(false)),
        tap(initMats)
    )
    .subscribe(src => {
        SrcSize = {
            width: src.width,
            height: src.height
        }
        RoiRange = {
            width: [16, Math.min(DEFAULT_ROI_RANGE.width[1], SrcSize.width)],
            height: [16, Math.min(DEFAULT_ROI_RANGE.height[1], SrcSize.height)]
        }
        roiUpdate.next({ isInit: true, roi: { x: 0, y: 0, width: Math.min(400, src.width), height: Math.min(400, src.height) } })
        growValley(edgeRoi)
        displayUpdate.next({ dimBy: 96 })
        hist = []
        initedStore.next(true)
    })

edgeUpdate
    .pipe(
        filter(() => initedStore.value),
    )
    .subscribe(update => {
        if (update.targets?.length) {
            update.targets.forEach(p => setVal(edgeRoi, p, [update.isSet ? 255 : 0]))
            if (!update.isUndo) hist.push({ update: edgeUpdate, roi: roiStore.value, targets: update.targets!, isSet: !update.isSet! })
        }
        growValley(edgeRoi)
        displayUpdate.next({})
    })

labelUpdate
    .pipe(
        filter(() => initedStore.value),
    )
    .subscribe(update => {
        if (update.targets?.length) {
            update.targets.forEach(p => setVal(labelRoi, p, [update.isSet ? 255 : 0]))
            if (!update.isUndo) hist.push({ update: labelUpdate, roi: roiStore.value, targets: update.targets!, isSet: !update.isSet! })
        }
        outputLabel()
        displayUpdate.next({})
    })

displayUpdate
    .pipe(
        filter(() => initedStore.value),
        tap(() => composeDisplay(display, composeStore.value)),
    )
    .subscribe(update => {
        if (update.targets?.length) update.targets.forEach(p => setVal(display, p, update.color!))
        if (update.dimBy) dimBy(display, update.dimBy)
        imshow(display)
    })
