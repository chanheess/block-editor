/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * 보더 노드 렌더링 - Port, Item (SysON 스타일)
 * ********************************************************************************/
(function () {
    const ns = (window.SELAB = window.SELAB || {});
    ns.Editor = ns.Editor || {};
    ns.Editor.render = ns.Editor.render || {};
    ns.Editor.render.elements = ns.Editor.render.elements || {};

    /**
     * 단일 보더 노드를 렌더링합니다.
     * @param {SVGElement} group - SVG 그룹
     * @param {Object} element - 부모 노드 데이터
     * @param {Object} bn - 보더 노드 데이터
     */
    function drawSingleBorderNode(group, element, bn) {
        console.log(`[drawBorderNode] Drawing border node "${bn.name}" (${bn.nodeType}) on element "${element.name}"`, bn);
        
        const pos = ns.Editor.renderUtils.calculatePortPosition(element, bn);
        console.log(`[drawBorderNode] Border node "${bn.name}" position:`, pos);
        
        const size = 10; // SysON 스타일: 작은 크기
        const borderRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        borderRect.setAttribute('x', String(pos.x - size / 2));
        borderRect.setAttribute('y', String(pos.y - size / 2));
        borderRect.setAttribute('width', String(size));
        borderRect.setAttribute('height', String(size));
        borderRect.setAttribute('class', bn.nodeType === 'item' ? 'diagram-item' : 'diagram-port');
        borderRect.setAttribute('fill', 'var(--vscode-editorWidget-background, #fff)');
        borderRect.setAttribute('stroke', bn.nodeType === 'item' ? '#4CAF50' : 'var(--vscode-input-border, #888)');
        borderRect.setAttribute('stroke-width', '2');
        borderRect.setAttribute('data-border-node-id', String(bn.id || bn.name || ''));
        borderRect.setAttribute('data-node-type', String(bn.nodeType || 'port'));
        if (bn.kind) borderRect.setAttribute('data-kind', String(bn.kind).toLowerCase());
        if (bn.direction) borderRect.setAttribute('data-direction', String(bn.direction).toLowerCase());
        group.appendChild(borderRect);
        
        // 방향성 아이콘 (화살표) - ItemUsage와 Action Parameter에 표시, 박스 안에 그리기
        if ((bn.nodeType === 'item' || bn.nodeType === 'parameter') && bn.direction) {
            const dir = String(bn.direction).toLowerCase();
            const side = String(bn.side || 'E').toUpperCase();
            let arrowPath = '';
            
            if (side === 'N' || side === 'S') {
                // 상하 배치일 경우 수직 화살표
                // N + in = Down (진입), S + out = Down (진출) -> 아래로
                // S + in = Up (진입), N + out = Up (진출) -> 위로
                const isDown = (side === 'N' && (dir === 'in' || dir.includes('in'))) ||
                               (side === 'S' && (dir === 'out' || dir.includes('out')));
                
                const arrowX = pos.x;
                const arrowStartY = pos.y - (isDown ? 2 : -2);
                const arrowEndY = pos.y + (isDown ? 2 : -2);
                
                // 수직선
                arrowPath = `M ${arrowX} ${arrowStartY} L ${arrowX} ${arrowEndY}`;
                
                if (isDown) {
                    // 아래쪽 화살표 머리 (v)
                    arrowPath += ` M ${arrowX - 2} ${arrowEndY - 2} L ${arrowX} ${arrowEndY} L ${arrowX + 2} ${arrowEndY - 2}`;
                } else {
                    // 위쪽 화살표 머리 (^)
                    arrowPath += ` M ${arrowX - 2} ${arrowEndY + 2} L ${arrowX} ${arrowEndY} L ${arrowX + 2} ${arrowEndY + 2}`;
                }
            } else {
                // 좌우 배치일 경우 수평 화살표 (기존 로직)
                if (dir === 'out' || dir.includes('out')) {
                    // 오른쪽 화살표 (박스 중앙)
                    const arrowStartX = pos.x - 2;
                    const arrowEndX = pos.x + 2;
                    const arrowY = pos.y;
                    arrowPath = `M ${arrowStartX} ${arrowY} L ${arrowEndX} ${arrowY} M ${arrowEndX - 2} ${arrowY - 2} L ${arrowEndX} ${arrowY} L ${arrowEndX - 2} ${arrowY + 2}`;
                } else if (dir === 'in' || dir.includes('in')) {
                    // 왼쪽 화살표 (박스 중앙)
                    const arrowStartX = pos.x + 2;
                    const arrowEndX = pos.x - 2;
                    const arrowY = pos.y;
                    arrowPath = `M ${arrowStartX} ${arrowY} L ${arrowEndX} ${arrowY} M ${arrowEndX + 2} ${arrowY - 2} L ${arrowEndX} ${arrowY} L ${arrowEndX + 2} ${arrowY + 2}`;
                }
            }
            
            if (arrowPath) {
                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                arrow.setAttribute('d', arrowPath);
                arrow.setAttribute('stroke', '#FFFFFF');
                arrow.setAttribute('stroke-width', '1.5');
                arrow.setAttribute('fill', 'none');
                group.appendChild(arrow);
            }
        }

        // Border Node 레이블 (Action 파라미터는 방향별 위치, 기타는 기존 규칙)
        if (bn.name) {
            const side = String(bn.side || 'E').toUpperCase();
            let labelX = pos.x;
            let labelY = pos.y;
            let textAnchor = 'middle';
            const direction = String(bn.direction || '').toLowerCase();
            const isParameterPin = bn.nodeType === 'parameter';
            
            // 레이블 텍스트: 파라미터는 이름만, 나머지는 타입 포함
            let labelText = String(bn.name);
            const borderNodeTypeLower = String(bn.nodeType || bn.type || bn.kind || '').toLowerCase();
            const shouldShowTypeName = !isParameterPin &&
                bn.typeName &&
                !((borderNodeTypeLower === 'item' || borderNodeTypeLower === 'itemusage' || borderNodeTypeLower === 'directeditem') &&
                    String(bn.typeName).toLowerCase() === 'item');
            if (shouldShowTypeName) {
                labelText += ' : ' + String(bn.typeName);
            }
            
            if (isParameterPin && direction === 'in') {
                labelY = pos.y - size / 2 - 6;
                textAnchor = 'middle';
            } else if (isParameterPin && direction === 'out') {
                labelY = pos.y + size / 2 + 14;
                textAnchor = 'middle';
            } else {
                // E/W: 박스 경계선과 겹치지 않도록 아이콘 옆(바깥쪽)에 표시
                if (side === 'E') {
                    labelX = pos.x + size / 2 + 4;
                    labelY = pos.y + 4;
                    textAnchor = 'start';
                } else if (side === 'W') {
                    labelX = pos.x - size / 2 - 4;
                    labelY = pos.y + 4;
                    textAnchor = 'end';
                } else if (side === 'N') {
                    labelX = pos.x;
                    labelY = pos.y - size / 2 - 4;
                    textAnchor = 'middle';
                } else if (side === 'S') {
                    labelX = pos.x;
                    labelY = pos.y + size / 2 + 14;
                    textAnchor = 'middle';
                }
            }
            
            const nameLabel = ns.Editor.renderUtils.createSvgText(labelX, labelY, 'border-node-label', labelText, {
                textAnchor: textAnchor,
                fontSize: '11px',
                fontWeight: 'normal'
            });
            nameLabel.setAttribute('fill', '#ffffff');
            nameLabel.setAttribute('stroke', '#000000');
            nameLabel.setAttribute('stroke-width', '0.3');
            nameLabel.setAttribute('paint-order', 'stroke');
            group.appendChild(nameLabel);
        }
    }

    /**
     * 요소의 모든 보더 노드를 렌더링합니다.
     * @param {SVGElement} group - SVG 그룹
     * @param {Object} element - 부모 노드 데이터
     */
    function drawBorderNodes(group, element) {
        const borderNodes = Array.isArray(element.borderNodes) ? element.borderNodes : [];
        if (borderNodes.length === 0) return;

        console.log(`[drawBorderNode] Element "${element.name}" has ${borderNodes.length} border nodes:`, borderNodes);
        
        for (const bn of borderNodes) {
            drawSingleBorderNode(group, element, bn);
        }
    }

    // 모듈 내보내기
    ns.Editor.render.elements.drawBorderNodes = drawBorderNodes;
    ns.Editor.render.elements.drawSingleBorderNode = drawSingleBorderNode;
})();
