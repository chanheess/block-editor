/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * MxEdgeDistributor.js - 엣지 연결점 분산 (Rule O9-2 Association Lane Allocation)
 *   같은 노드에 모이거나 나가는 엣지의 exit/entry 지점을 면을 따라 분산해 겹침 방지.
 *   (MxEdgeBuilder.js에서 분리: distributeOverlappingEdges)
 * ********************************************************************************/
(function () {
    'use strict';

    const ns = (window.SELAB = window.SELAB || {});
    ns.MxGraph = ns.MxGraph || {};
    ns.MxGraph.factory = ns.MxGraph.factory || {};

    function log(prefix, ...args) {
        try { console.log(`[MxEdgeDistributor] ${prefix}`, ...args); } catch (_) {}
    }

    /**
     * 같은 노드에 여러 엣지가 연결될 때 연결점을 분산 배치 (겹침 방지)
     * @param {mxGraph} graph
     */
    function distributeOverlappingEdges(graph) {
        const model = graph.getModel();
        const defaultParent = graph.getDefaultParent();

        const allEdges = [];
        function collectEdges(cell) {
            const childCount = model.getChildCount(cell);
            for (let i = 0; i < childCount; i++) {
                const child = model.getChildAt(cell, i);
                if (model.isEdge(child)) allEdges.push(child);
                else if (model.isVertex(child)) collectEdges(child);
            }
        }
        collectEdges(defaultParent);
        if (allEdges.length < 2) return;

        function absCenter(cell) {
            if (!cell) return null;
            const geo = model.getGeometry(cell);
            if (!geo) return null;
            let x = geo.x || 0, y = geo.y || 0;
            const w = geo.width || 0, h = geo.height || 0;
            let p = cell.parent;
            while (p && p !== defaultParent && p !== model.getRoot()) {
                const pg = model.getGeometry(p);
                if (pg) { x += pg.x || 0; y += pg.y || 0; }
                p = p.parent;
            }
            return { x: x + w / 2, y: y + h / 2 };
        }

        function absBounds(cell) {
            if (!cell) return null;
            const geo = model.getGeometry(cell);
            if (!geo) return null;
            let x = geo.x || 0, y = geo.y || 0;
            const w = geo.width || 0, h = geo.height || 0;
            let p = cell.parent;
            while (p && p !== defaultParent && p !== model.getRoot()) {
                const pg = model.getGeometry(p);
                if (pg) { x += pg.x || 0; y += pg.y || 0; }
                p = p.parent;
            }
            return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
        }

        function exitSideFor(refCell, otherCenter) {
            const rb = absBounds(refCell);
            if (!rb || !otherCenter) return null;
            const right = rb.x + rb.w, bottom = rb.y + rb.h;
            if (otherCenter.y >= bottom) return 'S';
            if (otherCenter.y <= rb.y) return 'N';
            if (otherCenter.x >= right) return 'E';
            if (otherCenter.x <= rb.x) return 'W';
            const dS = bottom - otherCenter.y;
            const dN = otherCenter.y - rb.y;
            const dE = right - otherCenter.x;
            const dW = otherCenter.x - rb.x;
            const min = Math.min(dS, dN, dE, dW);
            if (min === dS) return 'S';
            if (min === dN) return 'N';
            if (min === dE) return 'E';
            return 'W';
        }

        function xyForSide(s, frac) {
            if (s === 'S') return [frac, 1];
            if (s === 'N') return [frac, 0];
            if (s === 'E') return [1, frac];
            return [0, frac];
        }

        function isAssocEdge(edgeCell) {
            const k = String(edgeCell?._edgeData?.kind || edgeCell?._edgeData?.type || '').toLowerCase();
            return k === 'association' || k === 'connector';
        }

        // 기존 exit/entry 앵커 스타일 제거 (분산 fraction으로 교체하기 위함)
        function stripAnchor(style, which) {
            return style
                .replace(new RegExp(`;?${which}X=[0-9.]+`, 'g'), '')
                .replace(new RegExp(`;?${which}Y=[0-9.]+`, 'g'), '')
                .replace(new RegExp(`;?${which}Perimeter=[0-9.]+`, 'g'), '');
        }

        const bySource = new Map(), byTarget = new Map();
        for (const e of allEdges) {
            if (!e.source || !e.target) continue;
            if (!e.source._isBorderNode) {
                const k = e.source.id;
                if (!bySource.has(k)) bySource.set(k, []);
                bySource.get(k).push(e);
            }
            if (!e.target._isBorderNode) {
                const k = e.target.id;
                if (!byTarget.has(k)) byTarget.set(k, []);
                byTarget.get(k).push(e);
            }
        }

        let count = 0;
        model.beginUpdate();
        try {
            for (const [, group] of bySource) {
                if (group.length <= 1) continue;
                const bySide = {};
                for (const e of group) {
                    const tc = absCenter(e.target);
                    if (!tc) continue;
                    const s = exitSideFor(e.source, tc);
                    if (!s) continue;
                    if (!bySide[s]) bySide[s] = [];
                    bySide[s].push({ e, perp: (s === 'N' || s === 'S') ? tc.x : tc.y });
                }
                for (const [s, arr] of Object.entries(bySide)) {
                    if (arr.length <= 1) continue;
                    arr.sort((a, b) => a.perp - b.perp);
                    for (let i = 0; i < arr.length; i++) {
                        const ed = arr[i].e;
                        if (ed._hasElkWaypoints) continue;
                        let st = model.getStyle(ed) || '';
                        if (st.includes('exitX=')) {
                            // Rule O9-2 (Association Lane Allocation): association/connector는
                            // O15-2가 side-center 앵커(exitX=0.5 등)를 박아둬 같은 출발점에
                            // 겹친다. 기존 앵커를 제거하고 분산 fraction으로 교체한다.
                            // spec/featuretyping 등은 기존대로 건너뛴다(회귀 방지).
                            if (!isAssocEdge(ed)) continue;
                            st = stripAnchor(st, 'exit');
                        }
                        const [eX, eY] = xyForSide(s, (i + 1) / (arr.length + 1));
                        st += `;exitX=${eX.toFixed(2)};exitY=${eY.toFixed(2)};exitPerimeter=0`;
                        model.setStyle(ed, st);
                        count++;
                    }
                }
            }
            for (const [, group] of byTarget) {
                if (group.length <= 1) continue;
                const bySide = {};
                for (const e of group) {
                    const sc = absCenter(e.source);
                    if (!sc) continue;
                    const s = exitSideFor(e.target, sc);
                    if (!s) continue;
                    if (!bySide[s]) bySide[s] = [];
                    bySide[s].push({ e, perp: (s === 'N' || s === 'S') ? sc.x : sc.y });
                }
                for (const [s, arr] of Object.entries(bySide)) {
                    if (arr.length <= 1) continue;
                    arr.sort((a, b) => a.perp - b.perp);
                    for (let i = 0; i < arr.length; i++) {
                        const ed = arr[i].e;
                        if (ed._hasElkWaypoints) continue;
                        let st = model.getStyle(ed) || '';
                        if (st.includes('entryX=')) {
                            // Rule O9-2 (Association Lane Allocation): 위 source 루프와 동일.
                            if (!isAssocEdge(ed)) continue;
                            st = stripAnchor(st, 'entry');
                        }
                        const [nX, nY] = xyForSide(s, (i + 1) / (arr.length + 1));
                        st += `;entryX=${nX.toFixed(2)};entryY=${nY.toFixed(2)};entryPerimeter=0`;
                        model.setStyle(ed, st);
                        count++;
                    }
                }
            }
        } finally {
            model.endUpdate();
        }
        if (count > 0) log(`엣지 분산 배치: ${count}개 연결점 조정`);
    }

    ns.MxGraph.factory.distributeOverlappingEdges = distributeOverlappingEdges;
})();
