import React, { useRef, SyntheticEvent, MouseEvent, KeyboardEvent, WheelEvent, useState, useCallback } from 'react'
import { Radio, Button } from 'antd'
import 'antd/dist/antd.css'

import { srcUpdate, edgeUpdate, labelUpdate, displayUpdate, composeUpdate, DEFAULT_COMPOSE, roiUpdate } from './controller'
import { edgeRoi, labelRoi, getVal, fallPos, selectTillBranch, fillSelect, needRepair, getRoi } from './model'
import './App.css'

type ActionMode = 0 | 1 | 2 | 3 | 4 | 5 | 6
const NO_ACTION: ActionMode = 0
const WIPE_EDGE: ActionMode = 1
const DRAW_EDGE: ActionMode = 2
const REPAIR_EDGE: ActionMode = 3
const FILL_LABEL: ActionMode = 4
const SAVE_LABEL: ActionMode = 5
const MOVE_CANVAS: ActionMode = 6

type CursorMode = 0 | 1 | 2 | 3
const DISABLED = 0
const FALLING = 1
const ADHERE = 2
const FLOATING = 3

const ValidCursorModes = {
    0: [FALLING, ADHERE, FLOATING],
    1: [FALLING, FLOATING],
    2: [ADHERE, FLOATING],
    3: [FLOATING],
    4: [FLOATING],
    5: [DISABLED],
    6: [DISABLED],
}

const CursorColors = {
    0: [0, 0, 0, 0],
    1: [0, 255, 255, 255],
    2: [255, 0, 255, 255],
    3: [255, 0, 0, 255],
}

type EditHistory = {
    action: ActionMode,
    targets: number[][]
}
var hist: EditHistory[] = []

const getRelPos = (canvas: HTMLCanvasElement, e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvas.getBoundingClientRect()
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
}

const getRoiPos = (roi: any, relPos: number[]) => {
    const res = relPos.map((p, i) => Math.floor(p * [roi.width, roi.height][i]))
    return [res[1], res[0]]
}

export default function App() {
    const [isFocused, setFocused] = useState(false)
    const [actionMode, setActionMode] = useState<ActionMode>(NO_ACTION)
    const [cursorMode, setCursorMode] = useState<CursorMode>(FALLING)
    const [isMouseDown, setMouseDown] = useState(false)
    const [movePrevPos, setMovePrevPos] = useState([-1, -1])
    const imageSrc = useRef<HTMLImageElement>(null)

    const doAction = useCallback((pos: number[], pressed = false) => {
        let targets: number[][]
        switch (cursorMode) {
            case DISABLED:
                targets = []
                break
            case FLOATING:
                targets = [pos]
                break
            case FALLING:
                targets = selectTillBranch(edgeRoi, fallPos(edgeRoi, pos))
                break
            case ADHERE:
                targets = [fallPos(edgeRoi, pos, true)].filter(p => getVal(edgeRoi, p))
        }
        if (actionMode === MOVE_CANVAS) {
            if (!isMouseDown) return
            const roi = getRoi()
            roiUpdate.next({
                ...roi,
                x: roi.x + movePrevPos[1] - pos[1],
                y: roi.y + movePrevPos[0] - pos[0],
            })
            hist.push({ action: MOVE_CANVAS, targets: [movePrevPos, pos] })
        } else if (actionMode === NO_ACTION || !(isMouseDown || pressed)) {
            displayUpdate.next((mat, util) => targets.forEach(p =>
                util.setVal(mat, p, CursorColors[cursorMode]))
            )
        } else {
            if (!targets.length) return
            switch (actionMode) {
                case WIPE_EDGE:
                    targets = targets.filter(p => getVal(edgeRoi, p))
                    edgeUpdate.next((mat, util) => targets.forEach(p => util.setVal(mat, p, [0])))
                    break
                case DRAW_EDGE:
                    edgeUpdate.next((mat, util) => targets.forEach(p => util.setVal(mat, p, [255])))
                    break
                case REPAIR_EDGE:
                    const p = targets.pop()!
                    const range = 20
                    for (let i = p[0] - range; i < p[0] + range; i++)
                        for (let j = p[1] - range; j < p[1] + range; j++)
                            targets.push([i, j])
                    targets = targets.filter(p => needRepair(edgeRoi, p))
                    edgeUpdate.next((mat, util) => targets.forEach(p => util.setVal(mat, p, [255])))
                    break
                case FILL_LABEL:
                    targets = fillSelect([edgeRoi, labelRoi], targets[0])
                    labelUpdate.next((mat, util) => targets.forEach(p => util.setVal(mat, p, [255])))
            }
            if (!targets.length) return
            hist.push({ action: actionMode, targets: targets })
        }
    }, [actionMode, cursorMode, isMouseDown, movePrevPos])

    const undo = useCallback((h: EditHistory) => {
        switch (h.action) {
            case WIPE_EDGE:
                edgeUpdate.next((mat, util) => h.targets.forEach(p => util.setVal(mat, p, [255])))
                break
            case DRAW_EDGE:
                edgeUpdate.next((mat, util) => h.targets.forEach(p => util.setVal(mat, p, [0])))
                break
            case REPAIR_EDGE:
                edgeUpdate.next((mat, util) => h.targets.forEach(p => util.setVal(mat, p, [0])))
                break
            case FILL_LABEL:
                labelUpdate.next((mat, util) => h.targets.forEach(p => util.setVal(mat, p, [0])))
                break
            case MOVE_CANVAS:
                const roi = getRoi()
                roiUpdate.next({
                    ...roi,
                    x: roi.x + h.targets[1][1] - h.targets[0][1],
                    y: roi.y + h.targets[1][0] - h.targets[0][0],
                })
        }
    }, [])

    const onImageLoad = useCallback((e: SyntheticEvent<HTMLImageElement, Event>) => {
        srcUpdate.next(e.currentTarget)
    }, [])

    const onCanvasMouseEnter = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        displayUpdate.next((mat, util) => {
            if (!isFocused) util.dimBy(mat, 48)
        })
    }, [isFocused])

    const onCanvasMouseLeave = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        displayUpdate.next((mat, util) => {
            if (!isFocused) util.dimBy(mat, 96)
        })
    }, [isFocused])

    const onCanvasMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        if (!isFocused) return
        if (!getRoi()) return
        const pos = getRoiPos(getRoi(), getRelPos(e.currentTarget, e))
        if (pos.toString() === movePrevPos.toString()) return
        doAction(pos)
        setMovePrevPos(pos)
    }, [isFocused, movePrevPos, doAction])

    const onCanvasMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        setMovePrevPos([-1, -1])
        if (!isFocused) return
        setMouseDown(true)
        if (actionMode === NO_ACTION) return
        if (!getRoi()) return
        const pos = getRoiPos(getRoi(), getRelPos(e.currentTarget, e))
        doAction(pos, true)
    }, [isFocused, actionMode, doAction])

    const onCanvasMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        setMouseDown(false)
    }, [])

    const setModes = useCallback((newCursorMode: CursorMode, newActionMode: ActionMode) => {
        if (cursorMode !== newCursorMode) {
            while (ValidCursorModes[newActionMode].indexOf(newCursorMode) < 0)
                newCursorMode = (newCursorMode + 1) % 3 as CursorMode
            setCursorMode(newCursorMode)
        }
        if (actionMode !== newActionMode) {
            setActionMode(newActionMode)
            switch (newActionMode) {
                case WIPE_EDGE:
                    setCursorMode(FALLING)
                    composeUpdate.next({ ...DEFAULT_COMPOSE, showEdgeValley: true, bgWeight: 0.5 })
                    break
                case DRAW_EDGE:
                    setCursorMode(ADHERE)
                    composeUpdate.next({ ...DEFAULT_COMPOSE, bgWeight: 0.8, edgeWeight: 0.8 })
                    break
                case REPAIR_EDGE:
                    setCursorMode(FLOATING)
                    composeUpdate.next({ ...DEFAULT_COMPOSE, bgWeight: 0.8, edgeWeight: 0.8 })
                    break
                case FILL_LABEL:
                    setCursorMode(FLOATING)
                    composeUpdate.next({ ...DEFAULT_COMPOSE, bgWeight: 0.6 })
                    break
                case SAVE_LABEL:
                    setCursorMode(DISABLED)
                    composeUpdate.next({ ...DEFAULT_COMPOSE, showBg: false, showEdge: false, labelWeight: 1 })
                    break
                case MOVE_CANVAS:
                    setCursorMode(DISABLED)
                    composeUpdate.next(DEFAULT_COMPOSE)
                    break
                default:
                    setCursorMode(FALLING)
                    composeUpdate.next(DEFAULT_COMPOSE)
            }
        }
    }, [cursorMode, actionMode])


    const onCanvasKeyPress = useCallback((e: KeyboardEvent<HTMLCanvasElement>) => {
        setMovePrevPos([-1, -1])
        let newCursorMode: CursorMode = cursorMode, newActionMode: ActionMode = actionMode
        switch (e.key) {
            case "f":
                newCursorMode = (cursorMode + 1) % 3 as CursorMode
                break
            case "z":
                if (hist.length) undo(hist.pop()!)
                break
            case "w":
                newActionMode = WIPE_EDGE
                break
            case "e":
                newActionMode = DRAW_EDGE
                break
            case "r":
                newActionMode = REPAIR_EDGE
                break
            case "d":
                newActionMode = FILL_LABEL
                break
            case "s":
                newActionMode = SAVE_LABEL
                break
            case "m":
                newActionMode = MOVE_CANVAS
                break
            default:
                newActionMode = NO_ACTION
        }
        setModes(newCursorMode, newActionMode)
    }, [actionMode, cursorMode, undo, setModes])

    const onCanvasFocus = useCallback(() => {
        setFocused(true)
    }, [])

    const onCanvasBlur = useCallback(() => {
        setFocused(false)
        displayUpdate.next((mat, util) => util.dimBy(mat, 96))
    }, [])

    const onCanvasWheel = useCallback((e: WheelEvent<HTMLCanvasElement>) => {
        if (actionMode !== MOVE_CANVAS) return
        e.preventDefault()
        const relPos = getRelPos(e.currentTarget, e)
        const roi = getRoi()
        const oldPos = getRoiPos(roi, relPos)
        console.log(oldPos)
        const newRoi = {
            ...roi,
            width: roi.width - e.deltaY,
            height: roi.height - e.deltaY,
        }
        const newPos = getRoiPos(newRoi, relPos)
        console.log(newPos)
        roiUpdate.next({
            ...newRoi,
            x: roi.x + oldPos[1] - newPos[1],
            y: roi.y + oldPos[0] - newPos[0],
        })
    }, [actionMode])

    return (
        <div className="App">
            <div className="input">
                <img id="imageSrc" alt={"Canvas Input"} ref={imageSrc} onLoad={onImageLoad} style={{ display: "none" }} />
                <input type="file" id="fileInput" name="file" onChange={(e) => {
                    imageSrc.current!.src = URL.createObjectURL(e.target.files![0]);
                }} />
            </div>
            <div className="radio">
                <span>Action: </span>
                <Radio.Group value={actionMode} onChange={(e) => setModes(cursorMode, e.target.value)} disabled={!getRoi()}>
                    <Radio.Button value={NO_ACTION}>No Action</Radio.Button>
                    <Radio.Button value={WIPE_EDGE}>Wipe Edge (W)</Radio.Button>
                    <Radio.Button value={DRAW_EDGE}>Draw Edge (E)</Radio.Button>
                    <Radio.Button value={REPAIR_EDGE}>Repair Edge (R)</Radio.Button>
                    <Radio.Button value={FILL_LABEL}>Fill Label (D)</Radio.Button>
                    <Radio.Button value={SAVE_LABEL}>Save Label (S)</Radio.Button>
                    <Radio.Button value={MOVE_CANVAS}>Move Canvas (M)</Radio.Button>
                </Radio.Group>
            </div>
            <div className="radio">
                <span>Cursor (F): </span>
                <Radio.Group value={cursorMode} onChange={(e) => setModes(e.target.value, actionMode)} disabled={!getRoi()}>
                    <Radio.Button value={FALLING} disabled={ValidCursorModes[actionMode].indexOf(FALLING) < 0}>Fall to Edge</Radio.Button>
                    <Radio.Button value={ADHERE} disabled={ValidCursorModes[actionMode].indexOf(ADHERE) < 0}>Adhere to Edge</Radio.Button>
                    <Radio.Button value={FLOATING} disabled={ValidCursorModes[actionMode].indexOf(FLOATING) < 0}>Floating</Radio.Button>
                </Radio.Group>
                <Button className="undo" type="danger" ghost onClick={() => { if (hist.length) undo(hist.pop()!) }} disabled={!getRoi()}>Undo (Z)</Button>
            </div>
            <div className="canvas">
                <canvas
                    id="canvas"
                    className={actionMode === MOVE_CANVAS ? "moving" : ""}
                    onMouseEnter={onCanvasMouseEnter}
                    onMouseLeave={onCanvasMouseLeave}
                    onMouseMove={onCanvasMouseMove}
                    onMouseDown={onCanvasMouseDown}
                    onMouseUp={onCanvasMouseUp}
                    onKeyPress={onCanvasKeyPress}
                    onFocus={onCanvasFocus}
                    onBlur={onCanvasBlur}
                    onWheel={onCanvasWheel}
                    tabIndex={1000}
                />
            </div>
        </div>
    );
}
