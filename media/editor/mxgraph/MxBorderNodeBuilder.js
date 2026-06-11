/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * MxBorderNodeBuilder.js - mxGraph Border Node(portdefinition) 생성
 *   부모 셀 테두리에 포트/아이템을 작은 사각형으로 배치.
 *   (MxEdgeBuilder.js에서 분리: createBorderNode)
 * ********************************************************************************/
(function () {
    'use strict';

    const ns = (window.SELAB = window.SELAB || {});
    ns.MxGraph = ns.MxGraph || {};
    ns.MxGraph.factory = ns.MxGraph.factory || {};

    function createBorderNode(graph, parentCell, borderNode, index, total, sideIndex, sideTotal) {
        if (!graph || !parentCell || !borderNode) return null;

        const parentGeo = parentCell.getGeometry();
        if (!parentGeo) return null;

        const DS_bn = window.SELAB?.Editor?.config?.displaySettings;
        const size = DS_bn?.borderNode?.size ?? 12;
        const dirLower = String(borderNode.direction || '').toLowerCase();
        const isParameterPin = borderNode.nodeType === 'parameter' || borderNode.isParameter === true;

        const side = String(borderNode.side || 'E').toUpperCase();
        // processBorderNodes에서 이미 offset을 계산한 경우 그 값 우선 사용
        // 기본값(0.5)이면 sideIndex 기반 폴백 계산 적용
        const hasPrecomputedOffset = typeof borderNode.offset === 'number' && borderNode.offset !== 0.5;
        const computedOffset = hasPrecomputedOffset
            ? borderNode.offset
            : (typeof sideIndex === 'number' && typeof sideTotal === 'number' && sideTotal > 0)
                ? (sideIndex + 1) / (sideTotal + 1)
                : 0.25;
        const offset = Math.max(0, Math.min(1, computedOffset));

        let relativeX = 1, relativeY = offset;
        let geoOffsetX = -size / 2, geoOffsetY = -size / 2;
        let portConstraint = 'eastwest';

        switch (side) {
            case 'N':
                relativeX = offset; relativeY = 0;
                geoOffsetX = -size / 2; geoOffsetY = -size / 2;
                portConstraint = 'northsouth';
                break;
            case 'S':
                relativeX = offset; relativeY = 1;
                geoOffsetX = -size / 2; geoOffsetY = -size / 2;
                portConstraint = 'northsouth';
                break;
            case 'W':
                relativeX = 0; relativeY = offset;
                geoOffsetX = -size / 2; geoOffsetY = -size / 2;
                portConstraint = 'eastwest';
                break;
            case 'E': default:
                relativeX = 1; relativeY = offset;
                geoOffsetX = -size / 2; geoOffsetY = -size / 2;
                portConstraint = 'eastwest';
                break;
        }

        const isItem = borderNode.nodeType === 'item' || borderNode.nodeType === 'directedItem';
        const isDark = ns.MxGraph.styleColors?.isDarkTheme?.() || false;
        const strokeColor = isItem ? '#4CAF50' : (isDark ? '#999999' : '#333333');
        const bnFillColor = isDark ? '#2d2d2d' : '#FFFFFF';
        const bnFontColor = isDark ? '#e0e0e0' : '#333333';

        const bnSpTop = DS_bn?.borderNode?.spacingTop ?? 2;
        const bnSpBot = DS_bn?.borderNode?.spacingBottom ?? 2;
        let verticalLabelPosition = 'bottom';
        let verticalAlignValue = 'top';
        let spacingTopValue = bnSpTop;
        let spacingBottomValue = null;

        const isDirectedIn = dirLower === 'in' || dirLower.startsWith('in');
        const isDirectedOut = dirLower === 'out' || dirLower.startsWith('out');

        if ((isParameterPin || isItem) && isDirectedIn) {
            verticalLabelPosition = 'top';
            verticalAlignValue = 'bottom';
            spacingTopValue = null;
            spacingBottomValue = bnSpBot + 1; // 2 + 1 = 3
        } else if ((isParameterPin || isItem) && isDirectedOut) {
            verticalLabelPosition = 'bottom';
            verticalAlignValue = 'top';
            spacingTopValue = bnSpTop - 2; // Reduce space to make it look balanced with 'in'
        }

        const styleParts = [
            'shape=rectangle',
            `fillColor=${bnFillColor}`,
            `strokeColor=${strokeColor}`,
            'strokeWidth=2',
            'fontSize=8',
            `fontColor=${bnFontColor}`,
            `portConstraint=${portConstraint}`,
            'labelPosition=center',
            `verticalLabelPosition=${verticalLabelPosition}`,
            'align=center',
            `verticalAlign=${verticalAlignValue}`,
        ];
        if (spacingTopValue !== null) styleParts.push(`spacingTop=${spacingTopValue}`);
        if (spacingBottomValue !== null) styleParts.push(`spacingBottom=${spacingBottomValue}`);
        const style = styleParts.join(';');

        let label = borderNode.name || '';
        const borderNodeTypeLower = String(borderNode.nodeType || borderNode.type || borderNode.kind || '').toLowerCase();
        const shouldShowTypeName = !isParameterPin &&
            borderNode.typeName &&
            !((borderNodeTypeLower === 'item' || borderNodeTypeLower === 'itemusage' || borderNodeTypeLower === 'directeditem') &&
                String(borderNode.typeName).toLowerCase() === 'item');
        if (shouldShowTypeName) {
            label = `${label} : ${borderNode.typeName}`;
        }

        const borderCell = graph.insertVertex(
            parentCell,
            borderNode.id,
            label,
            relativeX, relativeY,
            size, size,
            style
        );

        const geo = borderCell.getGeometry();
        if (geo) {
            geo.relative = true;
            geo.offset = new mxPoint(geoOffsetX, geoOffsetY);
        }

        borderCell._nodeData = borderNode;
        borderCell._isBorderNode = true;

        return borderCell;
    }


    ns.MxGraph.factory.createBorderNode = createBorderNode;
})();
