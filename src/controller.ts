import { Subject, BehaviorSubject } from 'rxjs'
import { tap, filter, map, distinctUntilChanged } from 'rxjs/operators'

import { edgeRoi, labelRoi, display, imshow, setVal, growValley, composeDisplay, dimBy, initMats, setRoi, ComposeConfig, outputLabel } from './model'

type DisplayUtil = {
    setVal: (mat: any, pos: number[], val: number[]) => void
    dimBy: (mat: any, amount: number) => void
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
    roi: any,
    targets: number[][],
    isSet: boolean,
}

const hist: DataUpdateUndo[] = []

export var RoiRange = {
    width: [16, 800],
    height: [16, 800],
}

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

export const composeUpdate = new Subject<any>()
export const composeStore = new BehaviorSubject<ComposeConfig>(DEFAULT_COMPOSE)
export const roiUpdate = new Subject<any>()
export const roiStore = new BehaviorSubject<any>(null)

export const srcUpdate = new Subject<HTMLImageElement>()
export const edgeUpdate = new Subject<DataUpdate>()
export const labelUpdate = new Subject<DataUpdate>()
export const displayUpdate = new Subject<DisplayUpdate>()

export const undo = () => {
    const h = hist.pop()
    if (!h) return
    roiUpdate.next(h.roi)
    h.update.next({ ...h, isUndo: true })
}

const fitRange = (r: number[], n: number) => n < r[0] ? r[0] : (n > r[1] ? r[1] : n)

const restrictRoi = (roi: any) => ({
    width: fitRange(RoiRange.width, roi.width),
    height: fitRange(RoiRange.height, roi.height),
    x: fitRange([0, RoiRange.width[1] - roi.width - 1], roi.x),
    y: fitRange([0, RoiRange.height[1] - roi.height - 1], roi.y),
})

composeUpdate
    .pipe(
        filter(() => roiStore.value),
    )
    .subscribe(config => composeStore.next(config))
composeStore
    .subscribe(() => displayUpdate.next({}))

roiUpdate
    .pipe(
        map(restrictRoi),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
        tap(console.log),
        tap(setRoi)
    )
    .subscribe(roi => roiStore.next(roi))
roiStore
    .subscribe(() => edgeUpdate.next({}))

srcUpdate
    .pipe(
        tap(initMats)
    )
    .subscribe(src => {
        RoiRange = {
            width: [16, Math.min(RoiRange.width[1], src.width)],
            height: [16, Math.min(RoiRange.height[1], src.height)]
        }
        roiUpdate.next({ x: 0, y: 0, width: Math.min(400, src.width), height: Math.min(400, src.height) })
        growValley(edgeRoi)
        displayUpdate.next({ dimBy: 96 })
    })

edgeUpdate
    .pipe(
        filter(() => roiStore.value),
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
        filter(() => roiStore.value),
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
        filter(() => roiStore.value),
        tap(() => composeDisplay(display, composeStore.value)),
    )
    .subscribe(update => {
        if (update.targets?.length) update.targets.forEach(p => setVal(display, p, update.color!))
        if (update.dimBy) dimBy(display, update.dimBy)
        imshow(display)
    })
