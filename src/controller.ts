import { Subject, BehaviorSubject } from 'rxjs'
import { tap, filter } from 'rxjs/operators'

import { edgeRoi, labelRoi, display, imshow, setVal, growValley, composeDisplay, dimBy, initMats, setRoi, ComposeConfig } from './model'

type MatUtil = {
    setVal: (mat: any, pos: number[], val: number[]) => void
    dimBy: (mat: any, amount: number) => void
}

type MatUpdate = (mat: any, util: MatUtil) => void

export const DEFAULT_COMPOSE = {
    showEdge: true,
    showEdgeValley: false,
    labelColor: [255, 255, 0, 255],
    bgWeight: 1,
    edgeWeight: 0.4,
}

export const composeUpdate = new BehaviorSubject<ComposeConfig>(DEFAULT_COMPOSE)
export const roiUpdate = new Subject<any>()

export const srcUpdate = new Subject<HTMLImageElement>()
export const edgeUpdate = new Subject<MatUpdate>()
export const labelUpdate = new Subject<MatUpdate>()
export const displayUpdate = new Subject<MatUpdate>()

const MatUtilImpl: MatUtil = {
    setVal: setVal,
    dimBy: dimBy,
}

composeUpdate
    .pipe(
        filter(() => display),
    )
    .subscribe(() => {
        composeDisplay(display, composeUpdate.value)
        imshow(display)
    })

roiUpdate
    .pipe(
        tap(setRoi)
    )
    .subscribe(() => {
        growValley(edgeRoi)
        composeDisplay(display, composeUpdate.value)
        imshow(display)
    })

srcUpdate
    .pipe(
        tap(initMats)
    )
    .subscribe(
        () => displayUpdate.next((mat, util) => util.dimBy(mat, 96))
    )

edgeUpdate
    .pipe(
        filter(() => edgeRoi),
        tap(update => update(edgeRoi, MatUtilImpl))
    )
    .subscribe(() => {
        growValley(edgeRoi)
        composeDisplay(display, composeUpdate.value)
        imshow(display)
    })

labelUpdate
    .pipe(
        filter(() => labelRoi),
        tap(update => update(labelRoi, MatUtilImpl))
    )
    .subscribe(() => {
        composeDisplay(display, composeUpdate.value)
        imshow(display)
    })

displayUpdate
    .pipe(
        filter(() => display),
        tap(() => composeDisplay(display, composeUpdate.value)),
        tap(update => update(display, MatUtilImpl))
    )
    .subscribe(() => {
        imshow(display)
    })
