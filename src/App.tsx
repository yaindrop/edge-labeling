import React, { useRef, SyntheticEvent, MouseEvent, KeyboardEvent, WheelEvent, useState, useCallback, useEffect, useMemo } from 'react'
import { Radio, Button, Switch, Col, Row, Slider } from 'antd'
import 'antd/dist/antd.css'

import { srcUpdate, edgeUpdate, labelUpdate, displayUpdate, composeUpdate, roiUpdate, composeStore, roiStore, RoiRange, DEFAULT_COMPOSE, undo } from './controller'
import { edgeRoi, labelRoi, getVal, fallPos, selectTillBranch, fillSelect, needRepair } from './model'
import './App.css'

type ActionMode = 0 | 1 | 2 | 3 | 4
const NO_ACTION: ActionMode = 0
const WIPE_EDGE: ActionMode = 1
const DRAW_EDGE: ActionMode = 2
const REPAIR_EDGE: ActionMode = 3
const FILL_LABEL: ActionMode = 4

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
}

const ComposeConfigs = {
    0: DEFAULT_COMPOSE,
    1: { ...DEFAULT_COMPOSE, showEdgeValley: true, bgWeight: 0.5 },
    2: { ...DEFAULT_COMPOSE, bgWeight: 0.8, edgeWeight: 0.8 },
    3: { ...DEFAULT_COMPOSE, bgWeight: 0.8, edgeWeight: 0.8 },
    4: { ...DEFAULT_COMPOSE, bgWeight: 0.6 },
    5: { ...DEFAULT_COMPOSE, showEdge: false, labelWeight: 0.4 },
}

const CursorColors = {
    0: [0, 0, 0, 0],
    1: [0, 255, 255, 255],
    2: [255, 0, 255, 255],
    3: [255, 0, 0, 255],
}

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
    const [isMovingCanvas, setMovingCanvas] = useState(false)
    const [roi, setRoi] = useState(roiStore.value)
    const [composeConfig, setComposeConfig] = useState(composeStore.value)
    const imageSrc = useRef<HTMLImageElement>(null)
    const labelOutput = useRef<HTMLCanvasElement>(null)
    const inited = roi && true

    useEffect(() => {
        const roiSub = roiStore.subscribe(setRoi)
        const composeSub = composeStore.subscribe(setComposeConfig)
        return () => {
            roiSub.unsubscribe()
            composeSub.unsubscribe()
        }
    }, [])

    const downloadLabel = useCallback(() => {
        const link = document.createElement('a')
        link.download = 'label.png'
        link.href = labelOutput.current?.toDataURL("image/png")!
        link.click();
    }, [])

    const doAction = useCallback((pos: number[], pressed = false) => {
        if (isMovingCanvas) {
            if (!isMouseDown || movePrevPos[0] === -1) return
            console.log(roi)
            roiUpdate.next({
                ...roi,
                x: roi.x + movePrevPos[1] - pos[1],
                y: roi.y + movePrevPos[0] - pos[0],
            })
        } else {
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
            if (actionMode === NO_ACTION || !(isMouseDown || pressed)) {
                displayUpdate.next({ targets: targets, color: CursorColors[cursorMode] })
            } else {
                if (!targets.length) return
                switch (actionMode) {
                    case WIPE_EDGE:
                        targets = targets.filter(p => getVal(edgeRoi, p) === 255)
                        edgeUpdate.next({ isSet: false, targets: targets })
                        break
                    case DRAW_EDGE:
                        edgeUpdate.next({ isSet: true, targets: targets })
                        break
                    case REPAIR_EDGE:
                        const p = targets.pop()!
                        const range = 20
                        for (let i = p[0] - range; i < p[0] + range; i++)
                            for (let j = p[1] - range; j < p[1] + range; j++)
                                targets.push([i, j])
                        targets = targets.filter(p => needRepair(edgeRoi, p))
                        edgeUpdate.next({ isSet: true, targets: targets })
                        break
                    case FILL_LABEL:
                        targets = fillSelect([edgeRoi, labelRoi], targets[0])
                        labelUpdate.next({ isSet: true, targets: targets })
                }
                if (!targets.length) return
            }
        }
    }, [roi, actionMode, cursorMode, isMouseDown, movePrevPos, isMovingCanvas])

    const setModes = useCallback((newCursorMode: CursorMode, newActionMode: ActionMode) => {
        if (cursorMode !== newCursorMode) {
            while (ValidCursorModes[newActionMode].indexOf(newCursorMode) < 0)
                newCursorMode = (newCursorMode + 1) % 4 as CursorMode
            setCursorMode(newCursorMode)
        }
        if (actionMode !== newActionMode) {
            setActionMode(newActionMode)
            setCursorMode(ValidCursorModes[newActionMode][0] as CursorMode)
            composeUpdate.next(ComposeConfigs[newActionMode])
        }
    }, [cursorMode, actionMode])

    const onImageLoad = useCallback((e: SyntheticEvent<HTMLImageElement, Event>) => {
        srcUpdate.next(e.currentTarget)
    }, [])

    const onCanvasMouseEnter = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        if (!inited) return
        if (!isFocused) displayUpdate.next({ dimBy: 64 })
    }, [inited, isFocused])

    const onCanvasMouseLeave = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        if (!inited) return
        setMouseDown(false)
        setMovePrevPos([-1, -1])
        if (!isFocused) displayUpdate.next({ dimBy: 96 })
    }, [inited, isFocused])

    const onCanvasMouseMove = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        if (!inited) return
        if (!isFocused) return
        const pos = getRoiPos(roi, getRelPos(e.currentTarget, e))
        if (pos.toString() === movePrevPos.toString()) return
        doAction(pos)
        setMovePrevPos(pos)
    }, [inited, roi, isFocused, movePrevPos, doAction])

    const onCanvasMouseDown = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        if (!inited) return
        setMovePrevPos([-1, -1])
        if (!isFocused) return
        setMouseDown(true)
        if (actionMode === NO_ACTION) return
        const pos = getRoiPos(roi, getRelPos(e.currentTarget, e))
        doAction(pos, true)
    }, [inited, roi, isFocused, actionMode, doAction])

    const onCanvasMouseUp = useCallback((e: MouseEvent<HTMLCanvasElement>) => {
        if (!inited) return
        setMouseDown(false)
    }, [inited])

    const onCanvasKeyPress = useCallback((e: KeyboardEvent<HTMLCanvasElement>) => {
        if (!inited || isMovingCanvas) return
        setMovePrevPos([-1, -1])
        let newCursorMode: CursorMode = cursorMode, newActionMode: ActionMode = actionMode
        switch (e.key) {
            case "q": break
            case "f":
                newCursorMode = (cursorMode + 1) % 4 as CursorMode
                break
            case "z":
                undo()
                break
            case "s":
                downloadLabel()
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
            default:
                newActionMode = NO_ACTION
        }
        setModes(newCursorMode, newActionMode)
    }, [inited, isMovingCanvas, actionMode, cursorMode, setModes, downloadLabel])

    const onCanvasKeyDown = useCallback((e: KeyboardEvent<HTMLCanvasElement>) => {
        if (!inited) return
        switch (e.key) {
            case "q":
                setMovingCanvas(true)
                break
        }
    }, [inited])

    const onCanvasKeyUp = useCallback((e: KeyboardEvent<HTMLCanvasElement>) => {
        if (!inited) return
        switch (e.key) {
            case "q":
                setMovingCanvas(false)
                break
        }
    }, [inited])

    const onCanvasFocus = useCallback(() => {
        if (!inited) return
        setFocused(true)
        displayUpdate.next({})
    }, [inited])

    const onCanvasBlur = useCallback(() => {
        if (!inited) return
        setFocused(false)
        setMouseDown(false)
        setMovePrevPos([-1, -1])
        displayUpdate.next({ dimBy: 96 })
    }, [inited])

    const onCanvasWheel = useCallback((e: WheelEvent<HTMLCanvasElement>) => {
        if (!inited || !isMovingCanvas) return
        e.preventDefault()
        const relPos = getRelPos(e.currentTarget, e)
        const oldPos = getRoiPos(roi, relPos)
        const newRoi = {
            ...roi,
            width: e.deltaY > 0 ? Math.ceil(roi.width * 1.05) : Math.floor(roi.width * 0.95),
            height: e.deltaY > 0 ? Math.ceil(roi.height * 1.05) : Math.floor(roi.height * 0.95),
        }
        if (newRoi.width < RoiRange.width[0] || newRoi.width > RoiRange.width[1] ||
            newRoi.height < RoiRange.height[0] || newRoi.height > RoiRange.height[1])
            return
        const newPos = getRoiPos(newRoi, relPos)
        roiUpdate.next({
            ...newRoi,
            x: roi.x + oldPos[1] - newPos[1],
            y: roi.y + oldPos[0] - newPos[0],
        })
    }, [inited, roi, isMovingCanvas])

    const actionRow = useMemo(() => (
        <Row align={"middle"}>
            <Col span={24} >
                <span>Action: </span>
                <Radio.Group value={actionMode} onChange={(e) => setModes(cursorMode, e.target.value)} disabled={!inited}>
                    <Radio.Button value={NO_ACTION}>No Action</Radio.Button>
                    <Radio.Button value={WIPE_EDGE}>Wipe Edge (W)</Radio.Button>
                    <Radio.Button value={DRAW_EDGE}>Draw Edge (E)</Radio.Button>
                    <Radio.Button value={REPAIR_EDGE}>Repair Edge (R)</Radio.Button>
                    <Radio.Button value={FILL_LABEL}>Fill Label (D)</Radio.Button>
                </Radio.Group>
            </Col>
        </Row>
    ), [inited, actionMode, cursorMode, setModes])

    const miscRow = useMemo(() => (
        <Row align={"middle"}>
            <Col span={4}>
                <span>Move Canvas: </span>
                <Switch
                    checked={isMovingCanvas}
                    unCheckedChildren={"Q"}
                    checkedChildren={"Q"} />
            </Col>
            <Col span={10}>
                <span>Cursor (F): </span>
                <Radio.Group value={cursorMode} onChange={(e) => setModes(e.target.value, actionMode)} disabled={!inited}>
                    <Radio.Button value={FALLING} disabled={ValidCursorModes[actionMode].indexOf(FALLING) < 0}>Fall to Edge</Radio.Button>
                    <Radio.Button value={ADHERE} disabled={ValidCursorModes[actionMode].indexOf(ADHERE) < 0}>Adhere to Edge</Radio.Button>
                    <Radio.Button value={FLOATING} disabled={ValidCursorModes[actionMode].indexOf(FLOATING) < 0}>Floating</Radio.Button>
                </Radio.Group>
            </Col>
            <Col span={3}>
                <Button className="button" type="danger" ghost onClick={undo} disabled={!inited}>Undo (Z)</Button>
            </Col>
            <Col span={3}>
                <Button className="button" type="primary" ghost onClick={downloadLabel} disabled={!inited}>Save Label (S)</Button>
            </Col>
        </Row>
    ), [inited, actionMode, cursorMode, downloadLabel, isMovingCanvas, setModes])

    const appearanceRow = useMemo(() => (
        <Row align={"middle"}>
            <Col span={2} offset={4}><span>Appearance: </span></Col>
            <Col span={3}>
                <Switch
                    disabled={!inited}
                    checked={composeConfig.showBg}
                    unCheckedChildren={"Background"}
                    checkedChildren={"Background"}
                    onClick={() => composeUpdate.next({ ...composeConfig, showBg: !composeConfig.showBg })}
                />
                <Slider
                    disabled={!inited}
                    min={0}
                    max={1}
                    step={0.1}
                    value={composeConfig.bgWeight}
                    onChange={(e) => composeUpdate.next({ ...composeConfig, bgWeight: e as number })}
                />
            </Col>
            <Col span={3} offset={1}>
                <Row >
                    <Col span={12}>
                        <Switch
                            disabled={!inited}
                            checked={composeConfig.showEdge}
                            unCheckedChildren={"Edge"}
                            checkedChildren={"Edge"}
                            onClick={() => composeUpdate.next({ ...composeConfig, showEdge: !composeConfig.showEdge })}
                        />
                    </Col>
                    <Col span={12}>
                        <Switch
                            disabled={!inited}
                            checked={composeConfig.showEdgeValley && composeConfig.showEdge}
                            unCheckedChildren={"Valley"}
                            checkedChildren={"Valley"}
                            onClick={() => composeUpdate.next({ ...composeConfig, showEdgeValley: !composeConfig.showEdgeValley })}
                        />
                    </Col>
                </Row>
                <Slider
                    disabled={!inited}
                    min={0}
                    max={1}
                    step={0.1}
                    value={composeConfig.edgeWeight}
                    onChange={(e) => composeUpdate.next({ ...composeConfig, edgeWeight: e as number })}
                />
            </Col>
            <Col span={3} offset={1}>
                <Switch
                    disabled={!inited}
                    checked={composeConfig.showLabel}
                    unCheckedChildren={"Label"}
                    checkedChildren={"Label"}
                    onClick={() => composeUpdate.next({ ...composeConfig, showLabel: !composeConfig.showLabel })}
                />
                <Slider
                    disabled={!inited}
                    min={0}
                    max={1}
                    step={0.1}
                    value={composeConfig.labelWeight}
                    onChange={(e) => composeUpdate.next({ ...composeConfig, labelWeight: e as number })}
                />
            </Col>
        </Row>
    ), [inited, composeConfig])


    return (
        <div className="App">
            <div className="input">
                <img id="imageSrc" alt={"Canvas Input"} ref={imageSrc} onLoad={onImageLoad} style={{ display: "none" }} />
                <input type="file" id="fileInput" name="file" onChange={(e) => {
                    imageSrc.current!.src = URL.createObjectURL(e.target.files![0]);
                }} />
            </div>
            {actionRow}
            {miscRow}
            {appearanceRow}
            <div className="canvas">
                <canvas
                    id="canvas"
                    className={isMovingCanvas ? "moving" : ""}
                    onMouseEnter={onCanvasMouseEnter}
                    onMouseLeave={onCanvasMouseLeave}
                    onMouseMove={onCanvasMouseMove}
                    onMouseDown={onCanvasMouseDown}
                    onMouseUp={onCanvasMouseUp}
                    onKeyPress={onCanvasKeyPress}
                    onFocus={onCanvasFocus}
                    onBlur={onCanvasBlur}
                    onWheel={onCanvasWheel}
                    onKeyDown={onCanvasKeyDown}
                    onKeyUp={onCanvasKeyUp}
                    tabIndex={1000}
                />
            </div>
            <canvas id="output" ref={labelOutput} />
        </div>
    );
}
