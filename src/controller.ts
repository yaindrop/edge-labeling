import { Subject, BehaviorSubject } from 'rxjs'
import { tap, filter } from 'rxjs/operators'

import { edgeRoi, labelRoi, displayRoi, setVal, growValley, composeDisplay, dimBy, initMats, imshow, ComposeConfig } from './model'

type MatUtil = {
    setVal: (mat: any, pos: number[], val: number[]) => void
    dimBy: (mat: any, amount: number) => void
}

type MatUpdate = (mat: any, util: MatUtil) => void

export const srcUpdate = new Subject<HTMLImageElement>()
export const edgeUpdate = new Subject<MatUpdate>()
export const labelUpdate = new Subject<MatUpdate>()
export const displayUpdate = new Subject<MatUpdate>()
export const DEFAULT_COMPOSE = {
    showEdgeValley: false,
    labelColor: [255, 255, 0, 255],
    bgWeight: 1,
    edgeWeight: 0.4,
}
export const composeUpdate = new BehaviorSubject<ComposeConfig>(DEFAULT_COMPOSE)

const MatUtilImpl: MatUtil = {
    setVal: setVal,
    dimBy: dimBy,
}

composeUpdate
    .pipe(
        filter(() => displayRoi),
    )
    .subscribe(() => {
        composeDisplay(displayRoi, composeUpdate.value)
        imshow(displayRoi)
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
        composeDisplay(displayRoi, composeUpdate.value)
        imshow(displayRoi)
    })

labelUpdate
    .pipe(
        filter(() => labelRoi),
        tap(update => update(labelRoi, MatUtilImpl))
    )
    .subscribe(() => {
        composeDisplay(displayRoi, composeUpdate.value)
        imshow(displayRoi)
    })

displayUpdate
    .pipe(
        filter(() => displayRoi),
        tap(() => composeDisplay(displayRoi, composeUpdate.value)),
        tap(update => update(displayRoi, MatUtilImpl))
    )
    .subscribe(() => {
        imshow(displayRoi)
    })
