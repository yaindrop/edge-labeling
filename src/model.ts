declare const cv: any

var bgMat: any
var edgeMat: any
var labelMat: any

var bgRoi: any
export var edgeRoi: any
export var labelRoi: any
export var display: any

export type ComposeConfig = {
    showBg: boolean
    bgWeight: number,
    showEdge: boolean,
    showEdgeValley: boolean,
    edgeWeight: number,
    showLabel: boolean,
    labelColor: number[],
    labelWeight: number,
}

export const Pos = {
    dist: (v1: number[], v2: number[]) => Math.sqrt(Math.pow(v1[0] - v2[0], 2) + Math.pow(v1[1] - v2[1], 2)),
    add: (v1: number[], v2: number[]) => [v1[0] + v2[0], v1[1] + v2[1]],
    sub: (v1: number[], v2: number[]) => [v1[0] - v2[0], v1[1] - v2[1]],
    mul: (v: number[], m: number) => [v[0] * m, v[1] * m],
    sum: (vecs: number[][]) => vecs.reduce((prev, curr) => Pos.add(prev, curr), [0, 0]),
    nbrs: (p: number[]) => [
        [p[0] - 1, p[1] - 1], [p[0], p[1] - 1], [p[0] + 1, p[1] - 1], [p[0] + 1, p[1]],
        [p[0] + 1, p[1] + 1], [p[0], p[1] + 1], [p[0] - 1, p[1] + 1], [p[0] - 1, p[1]]
    ],
    closeNbrs: (p: number[]) => [
        [p[0], p[1] - 1], [p[0] + 1, p[1]],
        [p[0], p[1] + 1], [p[0] - 1, p[1]]
    ],
}

export const getVal = (mat: any, pos: number[]) => {
    if (pos[0] >= 0 && pos[1] >= 0 && pos[0] < mat.cols && pos[1] < mat.rows)
        return mat.ucharPtr(pos[0], pos[1])[0] as number
    return 0
}

export const fallPos = (mat: any, pos: number[], earlyStop = false) => {
    let [curPos, curVal] = [pos, getVal(mat, pos)]
    if (curVal === 0) return curPos
    for (let r = 0; r < 20; r++) {
        let nbrs = Pos.nbrs(curPos)
        let vals = nbrs.map(pos => getVal(mat, pos))
        const maxNbrVal = Math.max(...vals)
        if (maxNbrVal === curVal) break
        const maxNbrs = vals.map((v, i) => v === maxNbrVal ? i : -1).filter(i => i > -1)
        if (earlyStop && maxNbrVal === 255) break
        vals = vals.filter((_, i) => maxNbrs.includes(i))
        nbrs = nbrs.filter((_, i) => maxNbrs.includes(i))
        const direction = Pos.sub(Pos.mul(Pos.sum(nbrs), 1 / maxNbrs.length), curPos)
        const dists = nbrs.map(pos => Pos.dist(pos, direction))
        curPos = nbrs[dists.indexOf(Math.min(...dists))]
        curVal = maxNbrVal
        if (curVal === 255) break
    }
    return curPos
}

const isBranch = (mat: any, pos: number[]) => {
    let nbrs = Pos.nbrs(pos)
    let vals = nbrs.map(p => getVal(mat, p)).map(v => v === 255 ? 1 : 0)
    let changes = 0
    if ((vals[7] && vals[0] && vals[1]) ||
        (vals[1] && vals[2] && vals[3]) ||
        (vals[3] && vals[4] && vals[5]) ||
        (vals[5] && vals[6] && vals[7])) return true
    for (let i = 0; i < 8; i++) changes += vals[i] ^ vals[(i + 1) % 8]
    return changes > 4
}

export const selectTillBranch = (mat: any, pos: number[], inclusive = false) => {
    if (getVal(mat, pos) !== 255) return []
    if (isBranch(mat, pos)) return [pos]
    const res: number[][] = []
    const stack: number[][] = []
    const visited: { [p: string]: boolean } = {}
    stack.push(pos)
    while (stack.length) {
        let curPos = stack.pop()!
        if (visited[curPos.toString()]) continue
        visited[curPos.toString()] = true
        res.push(curPos)
        const edgeNbrs = Pos.nbrs(curPos).filter(p => getVal(mat, p) === 255)
        const branchedNbrs = edgeNbrs.filter(p => isBranch(mat, p))
        if (branchedNbrs.length) {
            if (inclusive) branchedNbrs.forEach(p => res.push(p))
            continue
        }
        edgeNbrs.forEach(p => stack.push(p))
    }
    return res
}

export const needRepair = (mat: any[], pos: number[]) => {
    if (getVal(mat, pos) === 255) return false
    let nbrs = Pos.nbrs(pos)
    let vals = nbrs.map(p => getVal(mat, p)).map(v => v === 255 ? 1 : 0)
    const sum = vals.reduce((prev, curr) => prev + curr, 0 as number)
    if (sum >= 7) return true
    let changes = 0
    for (let i = 0; i < 8; i++) changes += vals[i] ^ vals[(i + 1) % 8]
    return changes >= 4
}

export const fillSelect = (mats: any[], pos: number[]) => {
    const hitWall = (p: number[]) => mats.filter(mat => getVal(mat, p) === 255).length > 0
    if (hitWall(pos)) return []
    const res: number[][] = []
    const stack: number[][] = []
    const visited: { [p: string]: boolean } = {}
    stack.push(pos)
    while (stack.length) {
        let curPos = stack.pop()!
        if (visited[curPos.toString()]) continue
        visited[curPos.toString()] = true
        res.push(curPos)
        const nonEdgeNbrs = Pos.closeNbrs(curPos).filter(p => !hitWall(p))
        nonEdgeNbrs.filter(p => !visited[p.toString()]).forEach(p => stack.push(p))
        if (res.length > 1000) break
    }
    return res
}

export const imshow = (mat: any) => cv.imshow('canvas', mat)

export const setVal = (mat: any, pos: number[], val: number[]) => {
    if (pos[0] >= 0 && pos[1] >= 0 && pos[0] < mat.cols && pos[1] < mat.rows)
        mat.ucharPtr(pos[0], pos[1]).set(val)
}

export const dimBy = (mat: any, amount: number) => {
    const dimMask = new cv.Mat(mat.rows, mat.cols, mat.type(), [0, 0, 0, amount])
    cv.subtract(mat, dimMask, mat)
    dimMask.delete()
}

export const composeDisplay = (display: any, config: ComposeConfig) => {
    display.setTo([0, 0, 0, 0])
    if (config.showBg) cv.addWeighted(display, 1, bgRoi, config.bgWeight, 0.0, display)
    if (config.showEdge) {
        const edgeCvted = new cv.Mat.zeros(edgeRoi.rows, edgeRoi.cols, edgeRoi.type())
        if (config.showEdgeValley) {
            cv.add(edgeRoi, edgeCvted, edgeCvted)
        } else {
            cv.threshold(edgeRoi, edgeCvted, 254, 255, cv.THRESH_BINARY)
        }
        cv.cvtColor(edgeCvted, edgeCvted, cv.COLOR_GRAY2RGBA)
        cv.addWeighted(display, 1, edgeCvted, config.edgeWeight, 0.0, display)
        edgeCvted.delete()
    }
    if (config.showLabel) {
        const labelThresed = new cv.Mat()
        cv.threshold(labelRoi, labelThresed, 254, 255, cv.THRESH_BINARY)
        const labelCvted = new cv.Mat()
        cv.cvtColor(labelThresed, labelCvted, cv.COLOR_GRAY2RGBA)
        const labelColorInv = new cv.Mat(labelCvted.rows, labelCvted.cols, labelCvted.type(), config.labelColor.map(c => 255 - c))
        cv.addWeighted(display, 1, labelCvted, config.labelWeight, 0.0, display)
        cv.subtract(display, labelColorInv, display, labelThresed)
        labelThresed.delete()
        labelCvted.delete()
        labelColorInv.delete()
    }
}

export const outputLabel = () => {
    const labelThresed = new cv.Mat()
    cv.threshold(labelMat, labelThresed, 254, 255, cv.THRESH_BINARY)
    cv.imshow('output', labelThresed)
}

export const growValley = (mat: any) => {
    cv.threshold(mat, mat, 254, 255, cv.THRESH_BINARY);
    for (let i = 2; i < 6; i++) {
        let filter = cv.Mat.ones(i, i, cv.CV_8U);
        let dilated = new cv.Mat()
        cv.dilate(mat, dilated, filter, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue())
        cv.addWeighted(mat, 0.8, dilated, 0.2, 0.0, mat);
        filter.delete()
        dilated.delete()
    }
}

const deleteRois = () => {
    if (display) {
        display.delete()
        bgRoi.delete()
        edgeRoi.delete()
        labelRoi.delete()
    }
}

export const deleteMats = () => {
    deleteRois()
    display = bgRoi = edgeRoi = labelRoi = undefined
    if (bgMat) {
        bgMat.delete()
        edgeMat.delete()
        labelMat.delete()
    }
}

export const initMats = (src: HTMLImageElement) => {
    deleteMats()
    bgMat = cv.imread(src)
    edgeMat = new cv.Mat()
    cv.cvtColor(bgMat, edgeMat, cv.COLOR_RGB2GRAY, 0)
    cv.Canny(edgeMat, edgeMat, 50, 100, 3, false)
    labelMat = new cv.Mat.zeros(edgeMat.rows, edgeMat.cols, edgeMat.type())
}

export const setRoi = (roi: any) => {
    deleteRois()
    display = new cv.Mat.zeros(roi.height, roi.width, bgMat.type())
    bgRoi = bgMat.roi(roi)
    edgeRoi = edgeMat.roi(roi)
    labelRoi = labelMat.roi(roi)
}
