/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * MxEdgeBuilder.js - mxGraph 엣지 및 Border Node 생성
 * 정규화된 엣지/border node 데이터를 mxGraph 셀로 변환
 * ********************************************************************************/
(function () {
    'use strict';

    const ns = (window.SELAB = window.SELAB || {});
    ns.MxGraph = ns.MxGraph || {};
    ns.MxGraph.factory = ns.MxGraph.factory || {};

    const getTypeRegistry = () => ns.Editor?.config?.typeRegistry || {};

    function log(prefix, ...args) {
        try {
            console.log(`[MxEdgeBuilder] ${prefix}`, ...args);
        } catch (_) {}
    }

    /**
     * 계층적 엣지 타입 판별 (typeRegistry 사용)
     * @param {string} kind
     * @returns {boolean}
     */
    function isHierarchicalEdgeKind(kind) {
        const typeReg = getTypeRegistry();
        if (typeReg.isHierarchicalEdgeKind) {
            return typeReg.isHierarchicalEdgeKind(kind);
        }
        if (!kind) return false;
        const k = String(kind).toLowerCase();
        if (k.includes('import') || k.includes('expose')) return false;
        if (k.includes('inheritance') || k.includes('specialization') || k.includes('generalization')) return false;
        return (
            k.includes('contain') || k.includes('own') || k.includes('compose') ||
            k.includes('aggregate') || k.includes('nest') || k.includes('member') ||
            k.includes('usage') || k.includes('perform') || k.includes('include') || k.includes('has')
        );
    }

    /**
     * ELK waypoints 단순화 (불필요한 꺾임점 제거)
     * @param {Array} waypoints - [{x, y}, ...]
     * @returns {Array}
     */
    function simplifyWaypoints(waypoints) {
        if (!waypoints || waypoints.length <= 2) return waypoints;

        const result = [waypoints[0]];
        for (let i = 1; i < waypoints.length - 1; i++) {
            const prev = result[result.length - 1];
            const curr = waypoints[i];
            const next = waypoints[i + 1];
            const isCollinearH = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
            const isCollinearV = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
            if (isCollinearH || isCollinearV) continue;
            result.push(curr);
        }
        result.push(waypoints[waypoints.length - 1]);
        return result;
    }

    /**
     * Border node의 side에 따른 exit 스타일 반환
     * @param {mxCell} cell
     * @returns {string}
     */
    function sideExitStyle(side) {
        switch (String(side || 'E').toUpperCase()) {
            case 'N': return 'exitX=0.5;exitY=0;exitPerimeter=0';
            case 'S': return 'exitX=0.5;exitY=1;exitPerimeter=0';
            case 'W': return 'exitX=0;exitY=0.5;exitPerimeter=0';
            case 'E': default: return 'exitX=1;exitY=0.5;exitPerimeter=0';
        }
    }

    /**
     * side(N/S/E/W)에 따른 entry 스타일 반환
     * @param {string} side
     * @returns {string}
     */
    function sideEntryStyle(side) {
        switch (String(side || 'E').toUpperCase()) {
            case 'N': return 'entryX=0.5;entryY=0;entryPerimeter=0';
            case 'S': return 'entryX=0.5;entryY=1;entryPerimeter=0';
            case 'W': return 'entryX=0;entryY=0.5;entryPerimeter=0';
            case 'E': default: return 'entryX=1;entryY=0.5;entryPerimeter=0';
        }
    }

    function getBorderNodeExitStyle(cell) {
        if (!cell?._isBorderNode || !cell._nodeData) return '';
        return sideExitStyle(cell._nodeData.side);
    }

    /**
     * Border node의 side에 따른 entry 스타일 반환
     * @param {mxCell} cell
     * @returns {string}
     */
    function getBorderNodeEntryStyle(cell) {
        if (!cell?._isBorderNode || !cell._nodeData) return '';
        return sideEntryStyle(cell._nodeData.side);
    }


    /**
     * ELK waypoints를 엣지 셀에 적용
     * @param {mxGraph} graph
     * @param {mxCell} edgeCell
     * @param {Object} edge - 엣지 데이터 (waypoints 포함)
     * @param {mxCell} sourceCell
     * @param {mxCell} targetCell
     */
    function applyElkWaypoints(graph, edgeCell, edge, sourceCell, targetCell) {
        const simplified = simplifyWaypoints(edge.waypoints);
        if (!simplified || simplified.length < 2) return;

        const model = graph.getModel();
        model.beginUpdate();
        try {
            const defaultParent = graph.getDefaultParent();

            function getCellAbsBounds(cell) {
                if (!cell) return null;
                const g = model.getGeometry(cell);
                if (!g) return null;
                let cx = g.x || 0, cy = g.y || 0;
                const w = g.width || 0, h = g.height || 0;
                let p = cell.parent;
                while (p && p !== defaultParent && p !== model.getRoot()) {
                    const pg = model.getGeometry(p);
                    if (pg) { cx += pg.x || 0; cy += pg.y || 0; }
                    p = p.parent;
                }
                return { x: cx, y: cy, w, h };
            }

            // ELK waypoints를 geometry.points로 설정
            // startPoint도 포함(slice(0,-1))하여 mxGraph가 exitX/exitY 없이도 올바른 경로를 따르도록 함
            // exitX/exitY + geometry.points(bendPoints만) 조합 시 orthogonal router가 두 점 사이에
            // 추가 세그먼트를 삽입하여 꺾임점 오버슈팅 현상이 발생하므로 이 방식으로 변경
            const geoPoints = simplified.slice(0, -1); // startPoint + bendPoints (endPoint 제외)
            if (geoPoints.length > 0) {
                const geo = model.getGeometry(edgeCell);
                if (geo) {
                    const newGeo = geo.clone();
                    newGeo.points = geoPoints.map(p => ({ x: p.x, y: p.y }));
                    model.setGeometry(edgeCell, newGeo);
                }
            }

            let currentStyle = model.getStyle(edgeCell) || '';

            // border node는 side 기반 고정 좌표 사용 (ELK waypoints 대신)
            const srcIsBN = sourceCell._isBorderNode === true;
            const tgtIsBN = targetCell._isBorderNode === true;

            if (!currentStyle.includes('exitX=')) {
                if (srcIsBN) {
                    const bnExit = getBorderNodeExitStyle(sourceCell);
                    if (bnExit) currentStyle += `;${bnExit}`;
                }
                // 일반 노드: exitX/Y 추가 안 함 → geometry.points[0](=startPoint)이 자동으로 exit 역할
            }
            if (!currentStyle.includes('entryX=')) {
                if (tgtIsBN) {
                    const bnEntry = getBorderNodeEntryStyle(targetCell);
                    if (bnEntry) currentStyle += `;${bnEntry}`;
                } else {
                    const wpN = simplified[simplified.length - 1];
                    const tgtB = getCellAbsBounds(targetCell);
                    if (tgtB && tgtB.w > 0 && tgtB.h > 0) {
                        const clamp01 = (v) => Math.max(0, Math.min(1, v));
                        const nx = clamp01((wpN.x - tgtB.x) / tgtB.w);
                        const ny = clamp01((wpN.y - tgtB.y) / tgtB.h);
                        currentStyle += `;entryX=${nx.toFixed(3)};entryY=${ny.toFixed(3)};entryPerimeter=0`;
                    }
                }
            }
            model.setStyle(edgeCell, currentStyle);
            edgeCell._hasElkWaypoints = true;
        } finally {
            model.endUpdate();
        }
    }

    /**
     * 정규화된 엣지를 mxGraph 엣지로 변환
     * @param {mxGraph} graph
     * @param {Object} parent - 부모 셀
     * @param {Object} edge - 정규화된 엣지 데이터
     * @param {Object} cellMap - id → mxCell 매핑
     * @param {Set} borderNodeIds
     * @returns {mxCell|null}
     */
    function getCellAbsCenter(graph, cell) {
        const model = graph.getModel();
        const defaultParent = graph.getDefaultParent();
        const g = model.getGeometry(cell);
        if (!g) return null;
        let cx = (g.x || 0) + (g.width || 0) / 2;
        let x = g.x || 0;
        const w = g.width || 0;
        let p = cell.parent;
        while (p && p !== defaultParent && p !== model.getRoot()) {
            const pg = model.getGeometry(p);
            if (pg) { cx += pg.x || 0; x += pg.x || 0; }
            p = p.parent;
        }
        return { x, w, cx };
    }

    function createEdge(graph, parent, edge, cellMap, borderNodeIds) {
        if (!graph || !edge) return null;

        const {
            id,
            source: sourceId,
            target: targetId,
            type = 'default',
            kind = '',
            label = ''
        } = edge;

        const edgeType = kind || type || 'default';
        const edgeTypeLower = edgeType.toLowerCase();

        // Import/Expose 엣지 자동 라벨
        let edgeLabel = label;
        if (!edgeLabel && (edgeTypeLower.includes('import') || edgeTypeLower.includes('expose'))) {
            if (edgeTypeLower.includes('import')) {
                if (edgeTypeLower === 'membershipimport') edgeLabel = '«import»';
                else if (edgeTypeLower === 'namespaceimport') edgeLabel = '«import» *';
                else edgeLabel = '«import»';
            } else if (edgeTypeLower.includes('expose')) {
                edgeLabel = '«expose»';
            }
        }

        // 계층적 엣지 제외
        const isHierarchical = isHierarchicalEdgeKind(edgeType);
        if (isHierarchical && !edge.kindClass) {
            return null;
        }

        if (edgeTypeLower === 'containment') return null;
        if (id && String(id).startsWith('_implicit_')) return null;

        // cross-container featuretyping 엣지 필터링
        if (edgeTypeLower === 'featuretyping') {
            const sLast = String(sourceId).lastIndexOf('::');
            const tLast = String(targetId).lastIndexOf('::');
            const sParent = sLast > 0 ? sourceId.substring(0, sLast) : '';
            const tParent = tLast > 0 ? targetId.substring(0, tLast) : '';
            if (sParent !== tParent) {
                const sourceCell = cellMap[sourceId];
                const srcType = String(sourceCell?._nodeData?.type || '').toLowerCase();
                if (srcType.includes('action') && !cellMap[targetId]) return null;
            }
        }

        const sourceCell = cellMap[sourceId];
        const targetCell = cellMap[targetId];

        if (!sourceCell || !targetCell) {
            if (!borderNodeIds || !borderNodeIds.has(targetId)) {
                log('엣지 생성 실패 - 소스/타겟 없음:', id, sourceId, targetId);
            }
            return null;
        }

        let style = ns.MxGraph.styles?.getEdgeStyle?.(edgeType) || '';

        const srcIsBorderNode = sourceCell._isBorderNode === true;
        const tgtIsBorderNode = targetCell._isBorderNode === true;
        const borderNodeFeaturetyping = (srcIsBorderNode || tgtIsBorderNode) && edgeTypeLower === 'featuretyping';
        const isAssocOrConnector = edgeTypeLower === 'association' || edgeTypeLower === 'connector';
        const hasElkWaypoints = !borderNodeFeaturetyping && !isAssocOrConnector && edge.waypoints && Array.isArray(edge.waypoints) && edge.waypoints.length >= 2;

        // Rule O15 (Edge Anchor Consistency): featureTyping은 source.bottom -> target.top
        // anchor로 고정한다 (O11로 feature가 typed 바로 위에 인접 배치되므로 자연스럽게 직선이 됨).
        // specialization/containment은 parent가 child보다 아래/옆에 위치하는 경우가 많아
        // top/bottom 고정 anchor가 오히려 큰 우회를 유발하므로 기존 동적 anchor를 유지한다.
        if (!srcIsBorderNode && !tgtIsBorderNode) {
            if (edgeTypeLower === 'featuretyping') {
                // O15-1: typed node가 feature 바로 아래(dy >= dx)일 때만 기존
                // bottom->top anchor를 쓰고, 그 외(옆/위쪽 배치)에는 상대 위치
                // 기준 side anchor를 사용해 노드 위를 가로지르지 않게 한다.
                if (edge._ftExit === 'S' && edge._ftEntry === 'N') {
                    // resizeParentsToFitChildren()이 createEdge 이전에 실행되므로,
                    // elkLayout 시점의 _ftEntryX(비율) 대신 현재(최종) 셀 geometry
                    // 기준으로 entryX를 다시 계산해 typed의 width 변경에도 source
                    // 중심과 절대 X가 일치하도록 한다.
                    let entryX = edge._ftEntryX != null ? edge._ftEntryX : 0.5;
                    const srcAbs = getCellAbsCenter(graph, sourceCell);
                    const tgtAbs = getCellAbsCenter(graph, targetCell);
                    if (srcAbs && tgtAbs && tgtAbs.w > 0) {
                        entryX = Math.max(0, Math.min(1, (srcAbs.cx - tgtAbs.x) / tgtAbs.w));
                    }
                    style += `;exitX=0.5;exitY=1;exitPerimeter=0;entryX=${entryX.toFixed(3)};entryY=0;entryPerimeter=0;jettySize=0`;
                } else if (edge._ftExit && edge._ftEntry) {
                    style += `;${sideExitStyle(edge._ftExit)};${sideEntryStyle(edge._ftEntry)}`;
                } else {
                    style += ';exitX=0.5;exitY=1;exitPerimeter=0;entryX=0.5;entryY=0;entryPerimeter=0';
                }
            } else if ((edgeTypeLower === 'association' || edgeTypeLower === 'connector') &&
                       edge._assocExit && edge._assocEntry) {
                // Rule O15-2: featureTyping과 동일하게 상대 위치 기준 side anchor를
                // 고정해 단일 꺾임의 짧은 경로가 나오도록 한다.
                style += `;${sideExitStyle(edge._assocExit)};${sideEntryStyle(edge._assocEntry)};orthogonalLoop=0;jettySize=0`;
            }
        }

        if (!hasElkWaypoints) {
            let exitStyle = getBorderNodeExitStyle(sourceCell);
            let entryStyle = getBorderNodeEntryStyle(targetCell);

            if (exitStyle) style += `;${exitStyle}`;
            if (entryStyle) style += `;${entryStyle}`;
        }

        const edgeCell = graph.insertEdge(parent, id, edgeLabel, sourceCell, targetCell, style);

        // O15-1: featureTyping(non-border)은 항상 exitX/entryX 고정 anchor로 직선
        // 연결한다. ELK의 stale geometry.points가 섞이면 exit/entry anchor와
        // 무관하게 점을 거쳐가는 우회 경로가 생기므로 적용하지 않는다.
        if (hasElkWaypoints && !(edgeTypeLower === 'featuretyping' && !srcIsBorderNode && !tgtIsBorderNode)) {
            applyElkWaypoints(graph, edgeCell, edge, sourceCell, targetCell);
        }

        edgeCell._edgeData = edge;
        return edgeCell;
    }

    // Export
    ns.MxGraph.factory.createEdge = createEdge;
    ns.MxGraph.factory.isHierarchicalEdgeKind = isHierarchicalEdgeKind;
    // createBorderNode는 MxBorderNodeBuilder.js로,
    // distributeOverlappingEdges는 MxEdgeDistributor.js로 분리됨

    console.log('[MxEdgeBuilder] 모듈 로드 완료');
})();
