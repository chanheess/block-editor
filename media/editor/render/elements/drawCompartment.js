/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * drawCompartment - Compartment 렌더링 모듈
 * - 리프 노드 및 컨테이너 노드의 compartment 렌더링
 * - containment 엣지 기반 compartment 자동 빌드
 * ********************************************************************************/
(function () {
    const ns = (window.SELAB = window.SELAB || {});
    ns.Editor = ns.Editor || {};
    ns.Editor.render = ns.Editor.render || {};
    ns.Editor.render.elements = ns.Editor.render.elements || {};

    /**
     * containment 엣지 기반으로 compartment 데이터를 빌드합니다.
     * @param {Object} element - 부모 노드
     * @param {Object} app - 앱 인스턴스
     * @returns {Array} - compartment 배열
     */
    function buildCompartmentsFromEdges(element, app) {
        if (!app || !app.model) return [];
        
        const compartmentRules = ns.Editor.config && ns.Editor.config.compartmentRules;
        if (!compartmentRules || !compartmentRules.getCompartmentRenderData) return [];
        
        const edges = app.model.edges || [];
        const nodes = app.model.elements || [];
        const parentKind = element.kind || element.type;
        
        const builtCompartments = compartmentRules.getCompartmentRenderData(
            element.id,
            parentKind,
            edges,
            nodes
        );
        
        if (!builtCompartments || builtCompartments.length === 0) return [];
        
        return builtCompartments.map(comp => ({
            key: comp.label,
            items: comp.items,  // 노드 객체 전체 전달 (타입 정보 포함)
            collapsed: false,
            _nodes: comp.items,
        }));
    }

    /**
     * compartment 데이터를 가져옵니다 (서버 데이터 우선, 없으면 엣지 기반 빌드)
     * @param {Object} element - 노드
     * @param {Object} app - 앱 인스턴스
     * @returns {Array} - compartment 배열
     */
    function getCompartments(element, app) {
        console.log('[getCompartments] element:', element.name, 'type:', element.type, 'compartments:', element.compartments);
        
        // 1. 서버에서 보내준 compartments 사용
        if (Array.isArray(element.compartments) && element.compartments.length > 0) {
            console.log('[getCompartments] Using server compartments:', element.compartments.length);
            return element.compartments;
        }
        
        // 2. containment 엣지 기반으로 빌드
        const built = buildCompartmentsFromEdges(element, app);
        if (built.length > 0) {
            element.compartments = built;
            return built;
        }
        
        // 3. fallback: properties 배열 사용
        if (Array.isArray(element.properties) && element.properties.length > 0) {
            const generated = [{ key: 'attributes', items: [...element.properties], collapsed: false }];
            element.compartments = generated;
            return generated;
        }
        
        return [];
    }

    /**
     * Compartment 아이템 레이블 포맷팅 (타입 정보 포함)
     * @param {Object|string} item - compartment 아이템
     * @returns {string} 포맷된 레이블
     */
    function formatCompartmentItemLabel(item) {
        if (typeof item !== 'object') {
            return String(item || '');
        }
        
        let label = item.name || item.id || '';
        
        // 타입 정보 추가 (AttributeUsage, PortUsage 등)
        // 이미 name에 타입이 포함되어 있으면 중복 추가하지 않음
        const nameAlreadyHasType = label && label.includes(' : ');
        if ((item.declaredType || item.typeName) && !nameAlreadyHasType) {
            label += ' : ' + (item.declaredType || item.typeName);
        }
        
        // 방향성 표시 (in/out/inout)
        // in: 데이터가 들어옴 → 오른쪽 화살표
        // out: 데이터가 나감 → 왼쪽 화살표
        if (item.direction) {
            const dir = String(item.direction).toLowerCase();
            if (dir === 'in') {
                label = '→ ' + label;
            } else if (dir === 'out') {
                label = '← ' + label;
            } else if (dir === 'inout') {
                label = '↔ ' + label;
            }
        }
        
        // 기본값 표시
        if (item.defaultValue !== undefined && item.defaultValue !== null) {
            label += ' = ' + item.defaultValue;
        }
        
        return label;
    }

    /**
     * 리프 노드의 Compartments를 렌더링합니다.
     * @param {SVGElement} group - SVG 그룹
     * @param {SVGElement} rect - 노드 rect
     * @param {Object} element - 노드 데이터
     * @param {Object} app - 앱 인스턴스
     * @param {number} startY - 시작 Y 좌표
     * @param {number} idx - 현재 라인 인덱스
     * @param {number} lineHeight - 라인 높이
     * @param {number} padX - X 패딩
     * @param {boolean} dragging - 드래그 중 여부
     */
    function drawCompartments(group, rect, element, app, startY, idx, lineHeight, padX, dragging) {
        const compartments = getCompartments(element, app);
        if (compartments.length === 0) return;

        let y = startY + idx * lineHeight + 4;
        const sep = ns.Editor.renderUtils.createSvgLine(element.x, y, element.x + element.width, y, 'comp-sep');
        group.appendChild(sep);
        y += 6;

        const compWrap = ns.Editor.utils && ns.Editor.utils.wrapByWidth 
            ? ns.Editor.utils.wrapByWidth 
            : (t, _w) => [String(t || '')];
        const compMaxWidth = Math.max(10, element.width - padX * 2);
        const compMeasure = (txt) => ns.Editor.renderUtils.measureText(String(txt || ''), 'diagram-label', {});
        let maxRenderedW = 0;

        for (let ci = 0; ci < compartments.length; ci++) {
            const comp = compartments[ci] || {};
            
            // 디버깅: compartment 정보 로깅
            console.log('[drawCompartments] comp:', comp.key, 'layout:', comp.layout, 'items:', comp.items?.length);
            
            // 두 번째 compartment부터 구분선 추가 (첫 번째는 이미 위에서 그림)
            if (ci > 0) {
                const compSep = ns.Editor.renderUtils.createSvgLine(element.x, y, element.x + element.width, y, 'comp-sep');
                group.appendChild(compSep);
                y += 6;
            }
            
            // FreeForm compartment (action flow / perform actions) 처리
            const isFreeForm = comp.layout === 'freeform' || comp.key === 'action flow' || comp.key === 'perform actions';
            if (isFreeForm) {
                console.log('[drawCompartments] FreeForm compartment 렌더링:', comp.key);
                y = drawFreeFormCompartment(group, element, comp, y, padX, lineHeight, compMeasure);
                maxRenderedW = Math.max(maxRenderedW, element.width - padX * 2);
                continue;
            }
            
            // doc compartment 특별 처리
            if (comp.key === 'doc') {
                const items = Array.isArray(comp.items) ? comp.items : [];
                for (let ii = 0; ii < items.length; ii++) {
                    const item = items[ii];
                    // «doc» 스테레오타입
                    const docHeader = ns.Editor.renderUtils.createSvgText(
                        element.x + padX, y, 'comp-header', '«doc»'
                    );
                    group.appendChild(docHeader);
                    maxRenderedW = Math.max(maxRenderedW, compMeasure('«doc»'));
                    y += lineHeight;
                    
                    // body 내용
                    const bodyText = typeof item === 'object' ? (item.body || '') : item;
                    const lines = compWrap(String(bodyText ?? ''), compMaxWidth, '12px sans-serif');
                    for (const ln of lines) {
                        const bodySvg = ns.Editor.renderUtils.createSvgText(
                            element.x + padX + 8, y, 'comp-item', String(ln),
                            { dataCompIndex: ci, dataItemIndex: ii }
                        );
                        group.appendChild(bodySvg);
                        maxRenderedW = Math.max(maxRenderedW, compMeasure(ln));
                        y += lineHeight;
                    }
                }
                continue;
            }
            
            // 일반 리스트 compartment 처리
            const header = ns.Editor.renderUtils.createSvgText(
                element.x + padX, y, 'comp-header', String(comp.key || 'compartment')
            );
            group.appendChild(header);
            maxRenderedW = Math.max(maxRenderedW, compMeasure(String(comp.key || 'compartment')));
            y += lineHeight;

            const items = Array.isArray(comp.items) ? comp.items : [];
            for (let ii = 0; ii < items.length; ii++) {
                // items가 객체인 경우 타입 정보 포함하여 레이블 생성
                const itemText = formatCompartmentItemLabel(items[ii]);
                const lines = compWrap(String(itemText ?? ''), compMaxWidth, '12px sans-serif');
                for (const ln of lines) {
                    const itemSvg = ns.Editor.renderUtils.createSvgText(
                        element.x + padX + 8, y, 'comp-item', String(ln),
                        { dataCompIndex: ci, dataItemIndex: ii }
                    );
                    group.appendChild(itemSvg);
                    maxRenderedW = Math.max(maxRenderedW, compMeasure(ln));
                    y += lineHeight;
                }
            }
        }

        // 크기 조정 - 너비
        const needW = Math.ceil(maxRenderedW + padX * 2 + 8);
        if (needW > element.width) {
            element.width = needW;
            rect.setAttribute('width', String(needW));
            try { app._layoutChanged = true; } catch {}
        }
        
        // 크기 조정 - 높이
        const needH = Math.ceil(y - element.y + padX);
        if (needH > element.height) {
            element.height = needH;
            rect.setAttribute('height', String(needH));
            try { app._layoutChanged = true; } catch {}
        }
    }
    
    /**
     * FreeForm compartment (action flow)를 렌더링합니다.
     * @param {SVGElement} group - SVG 그룹
     * @param {Object} element - 부모 노드 데이터
     * @param {Object} comp - compartment 데이터
     * @param {number} startY - 시작 Y 좌표
     * @param {number} padX - X 패딩
     * @param {number} lineHeight - 라인 높이
     * @param {Function} compMeasure - 텍스트 측정 함수
     * @returns {number} - 다음 Y 좌표
     */
    function drawFreeFormCompartment(group, element, comp, startY, padX, lineHeight, compMeasure) {
        let y = startY;
        
        // compartment 헤더 (이탤릭체) - 일반 compartment와 동일한 간격 사용
        const header = ns.Editor.renderUtils.createSvgText(
            element.x + padX, y, 'comp-header', String(comp.key || 'action flow'),
            { fontStyle: 'italic' }
        );
        header.style.fontStyle = 'italic';
        group.appendChild(header);
        y += lineHeight;  // 일반 compartment와 동일하게 lineHeight만 사용
        
        const items = Array.isArray(comp.items) ? comp.items : [];
        if (items.length === 0) {
            return y;
        }
        
        // FreeForm 레이아웃: 각 항목을 그래픽 노드로 렌더링
        const metrics = ns.Editor.metrics?.FREEFORM_METRICS || {};
        const nodeWidth = metrics.NODE_WIDTH || 120;
        const nodeHeight = metrics.NODE_HEIGHT || 40;
        // compartment 타입에 따라 간격 조절
        // perform actions/action flow: 화살표 공간 필요
        // parts: 화살표 없음, 간격 최소화
        const hasActionFlowLayout = comp.key === 'action flow' || comp.key === 'perform actions';
        const nodeSpacingY = hasActionFlowLayout 
            ? (metrics.ACTION_FLOW_SPACING || 50) 
            : (metrics.PARTS_SPACING || 8);
        const startX = element.x + padX + (metrics.START_X_OFFSET || 20);
        
        // 노드 위치 정보 저장 (엣지 렌더링용)
        const nodePositions = [];
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemName = typeof item === 'object' ? (item.name || item.id || '') : String(item);
            const itemKind = typeof item === 'object' ? (item.kind || '') : '';
            const itemRole = typeof item === 'object' ? (item.role || '') : '';
            const isLastItem = i === items.length - 1;  // 마지막 아이템 여부
            
            const nodeX = startX;
            const nodeY = y;
            let nodeW = nodeWidth;
            let nodeH = nodeHeight;
            let centerX = nodeX;
            let bottomY = nodeY;
            
            // 노드 타입에 따른 렌더링
            if (itemRole === 'initial' || itemKind === 'StartAction') {
                // Start 노드: 검은 원
                centerX = nodeX;
                bottomY = nodeY + 10;  // 원의 반지름
                drawStartNode(group, nodeX, nodeY + 10);
                y += 30 + (isLastItem ? 0 : nodeSpacingY);
                nodePositions.push({ x: centerX, y: nodeY + 10, bottom: bottomY + 14, type: 'start' });
            } else if (itemRole === 'final' || itemKind === 'DoneAction') {
                // Done 노드: 검은 원 + 테두리
                centerX = nodeX;
                bottomY = nodeY + 12;
                drawDoneNode(group, nodeX, nodeY + 12);
                y += 34 + (isLastItem ? 0 : nodeSpacingY);
                nodePositions.push({ x: centerX, y: nodeY + 12, bottom: bottomY + 14, type: 'done' });
            } else if (itemKind === 'AssignmentActionUsage') {
                // Assign 노드: 사각형
                centerX = nodeX + nodeWidth / 2;
                bottomY = nodeY + nodeHeight;
                drawActionFlowNode(group, nodeX, nodeY, nodeWidth, nodeHeight, '«assign»', itemName.replace('assign ', ''));
                y += nodeHeight + (isLastItem ? 0 : nodeSpacingY);
                nodePositions.push({ x: centerX, y: nodeY, bottom: bottomY, type: 'assign' });
            } else if (itemKind === 'WhileLoopActionUsage' || itemKind === 'ForLoopActionUsage') {
                // Loop 노드: 사각형 + 조건 + body
                const itemBody = typeof item === 'object' ? (item.body || '') : '';
                const itemGuard = typeof item === 'object' ? (item.guard || '') : '';
                
                // body가 있으면 높이 증가
                const bodyLines = itemBody ? itemBody.split('\n').length : 0;
                nodeW = nodeWidth + 40;
                nodeH = nodeHeight + 20 + (bodyLines * 14);
                centerX = nodeX + nodeW / 2;
                bottomY = nodeY + nodeH;
                
                // 라벨 구성: «loop» + 이름 + body
                let loopLabel = '«loop»';
                let loopContent = itemName;
                if (itemBody) {
                    loopContent += '\n─────────\n' + itemBody;
                }
                
                drawActionFlowNode(group, nodeX, nodeY, nodeW, nodeH, loopLabel, loopContent);
                y += nodeH + (isLastItem ? 0 : nodeSpacingY);
                nodePositions.push({ x: centerX, y: nodeY, bottom: bottomY, type: 'loop' });
            } else {
                // 일반 Action 노드
                centerX = nodeX + nodeWidth / 2;
                bottomY = nodeY + nodeHeight;
                drawActionFlowNode(group, nodeX, nodeY, nodeWidth, nodeHeight, '«action»', itemName);
                y += nodeHeight + (isLastItem ? 0 : nodeSpacingY);
                nodePositions.push({ x: centerX, y: nodeY, bottom: bottomY, type: 'action' });
            }
        }
        
        // Succession 엣지 (화살표) 렌더링
        for (let i = 0; i < nodePositions.length - 1; i++) {
            const from = nodePositions[i];
            const to = nodePositions[i + 1];
            drawSuccessionArrow(group, from, to);
        }
        
        return y;
    }
    
    /**
     * Succession 화살표를 렌더링합니다.
     * @param {SVGElement} group - SVG 그룹
     * @param {Object} from - 시작 노드 위치 정보
     * @param {Object} to - 끝 노드 위치 정보
     */
    function drawSuccessionArrow(group, from, to) {
        // 시작점: from 노드의 하단 중앙
        const startX = from.x;
        const startY = from.bottom;
        
        // 끝점: to 노드의 상단 중앙
        const endX = to.x;
        const endY = to.y - 4;  // 화살표 머리 공간
        
        // 선 그리기
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(startX));
        line.setAttribute('y1', String(startY));
        line.setAttribute('x2', String(endX));
        line.setAttribute('y2', String(endY - 6));  // 화살표 머리 길이만큼 짧게
        line.setAttribute('class', 'action-flow-edge');
        line.style.stroke = 'var(--vscode-editor-foreground, #000)';
        line.style.strokeWidth = '1.5';
        group.appendChild(line);
        
        // 화살표 머리 그리기
        const arrowSize = 6;
        const arrowHead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const points = [
            `${endX},${endY}`,
            `${endX - arrowSize},${endY - arrowSize * 1.5}`,
            `${endX + arrowSize},${endY - arrowSize * 1.5}`
        ].join(' ');
        arrowHead.setAttribute('points', points);
        arrowHead.setAttribute('class', 'action-flow-arrow');
        arrowHead.style.fill = 'var(--vscode-editor-foreground, #000)';
        group.appendChild(arrowHead);
    }
    
    /**
     * Start 노드 (검은 원)를 렌더링합니다.
     */
    function drawStartNode(group, x, y) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', '10');
        circle.setAttribute('class', 'action-flow-start');
        circle.style.fill = 'var(--vscode-editor-foreground, #000)';
        circle.style.stroke = 'none';
        group.appendChild(circle);
        
        // 라벨
        const label = ns.Editor.renderUtils.createSvgText(
            x, y + 24, 'action-flow-label', 'start',
            { textAnchor: 'middle', fontSize: '10px' }
        );
        label.setAttribute('text-anchor', 'middle');
        group.appendChild(label);
    }
    
    /**
     * Done 노드 (검은 원 + 테두리)를 렌더링합니다.
     */
    function drawDoneNode(group, x, y) {
        // 외부 원 (테두리)
        const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        outerCircle.setAttribute('cx', String(x));
        outerCircle.setAttribute('cy', String(y));
        outerCircle.setAttribute('r', '12');
        outerCircle.setAttribute('class', 'action-flow-done-outer');
        outerCircle.style.fill = 'transparent';
        outerCircle.style.stroke = 'var(--vscode-editor-foreground, #000)';
        outerCircle.style.strokeWidth = '2';
        group.appendChild(outerCircle);
        
        // 내부 원 (검은색)
        const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        innerCircle.setAttribute('cx', String(x));
        innerCircle.setAttribute('cy', String(y));
        innerCircle.setAttribute('r', '8');
        innerCircle.setAttribute('class', 'action-flow-done-inner');
        innerCircle.style.fill = 'var(--vscode-editor-foreground, #000)';
        innerCircle.style.stroke = 'none';
        group.appendChild(innerCircle);
    }
    
    /**
     * Action Flow 노드 (사각형)를 렌더링합니다.
     */
    function drawActionFlowNode(group, x, y, width, height, stereotype, name) {
        // 사각형
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(height));
        rect.setAttribute('rx', '4');
        rect.setAttribute('ry', '4');
        rect.setAttribute('class', 'action-flow-node');
        rect.style.fill = 'var(--vscode-editorWidget-background, #fff)';
        rect.style.stroke = 'var(--vscode-input-border, #888)';
        rect.style.strokeWidth = '1.5';
        group.appendChild(rect);
        
        // 스테레오타입
        const stereotypeText = ns.Editor.renderUtils.createSvgText(
            x + width / 2, y + 12, 'action-flow-stereotype', stereotype,
            { textAnchor: 'middle', fontSize: '10px', fontStyle: 'italic' }
        );
        stereotypeText.setAttribute('text-anchor', 'middle');
        stereotypeText.style.fontStyle = 'italic';
        group.appendChild(stereotypeText);
        
        // 이름 (여러 줄 지원)
        const nameLines = String(name).split('\n');
        for (let i = 0; i < nameLines.length; i++) {
            const nameText = ns.Editor.renderUtils.createSvgText(
                x + width / 2, y + 24 + i * 12, 'action-flow-name', nameLines[i],
                { textAnchor: 'middle', fontSize: '11px', fontWeight: 'bold' }
            );
            nameText.setAttribute('text-anchor', 'middle');
            nameText.style.fontWeight = 'bold';
            group.appendChild(nameText);
        }
    }

    /**
     * 컨테이너 노드의 Compartments를 렌더링합니다.
     * @param {SVGElement} group - SVG 그룹
     * @param {SVGElement} rect - 노드 rect
     * @param {Object} element - 노드 데이터
     * @param {Object} app - 앱 인스턴스
     * @param {number} padX - X 패딩
     * @param {number} lineHeight - 라인 높이
     * @param {boolean} dragging - 드래그 중 여부
     * @param {string} typeLower - 소문자 타입
     */
    function drawContainerCompartments(group, rect, element, app, padX, lineHeight, dragging, typeLower) {
        const allCompartments = getCompartments(element, app);
        if (allCompartments.length === 0) return;

        // Rule A9: ports 컴파트먼트는 attribute 자식 노드들 아래(컨테이너 하단)에
        // 별도로 그린다. 나머지(doc 등)는 기존대로 헤더 바로 아래에 그린다.
        const compartments = allCompartments.filter(c => c.key !== 'ports');
        const portCompartments = allCompartments.filter(c => c.key === 'ports');

        const isPackageC = typeLower.includes('package');
        const typeText = ns.Editor.utils.getStereotypeText(element.type);
        const nameText = String(element.name || '');
        const maxWidth = Math.max(10, element.width - padX * 2);
        const wrap = ns.Editor.utils && ns.Editor.utils.wrapByWidth 
            ? ns.Editor.utils.wrapByWidth 
            : (t, _w) => [String(t || '')];
        
        const wType = wrap(typeText, maxWidth, '12px sans-serif');
        const wName = wrap(nameText, maxWidth, '12px sans-serif');
        const headerLineCount = (wType && wType[0] ? wType.length : 0) + (wName && wName[0] ? wName.length : 0);
        const headerH = isPackageC ? 24 : Math.max(22, Math.ceil(headerLineCount * lineHeight + 8));

        // 헤더 너비 조정
        if (!dragging) {
            try {
                const measure = (txt) => ns.Editor.renderUtils.measureText(String(txt || ''), 'diagram-label', {});
                let headerMaxW = 0;
                for (const ln of (Array.isArray(wType) ? wType : [])) headerMaxW = Math.max(headerMaxW, measure(ln));
                for (const ln of (Array.isArray(wName) ? wName : [])) headerMaxW = Math.max(headerMaxW, measure(ln));
                const needW = Math.ceil(headerMaxW + padX * 2);
                if (needW > element.width) {
                    element.width = needW;
                    rect.setAttribute('width', String(needW));
                    try { app._layoutChanged = true; } catch {}
                }
            } catch {}
        }

        let y = element.y + headerH + 4;
        if (!isPackageC) {
            const sep = ns.Editor.renderUtils.createSvgLine(element.x, y, element.x + element.width, y, 'comp-sep');
            group.appendChild(sep);
            y += 6;
        }

        const compMeasure = (txt) => ns.Editor.renderUtils.measureText(String(txt || ''), 'diagram-label', {});
        
        for (let ci = 0; ci < compartments.length; ci++) {
            const comp = compartments[ci] || {};
            
            // 두 번째 compartment부터 구분선 추가 (첫 번째는 이미 위에서 그림)
            if (ci > 0) {
                const compSep = ns.Editor.renderUtils.createSvgLine(element.x, y, element.x + element.width, y, 'comp-sep');
                group.appendChild(compSep);
                y += 6;
            }
            
            // FreeForm compartment (action flow / perform actions) 처리
            const isFreeForm = comp.layout === 'freeform' || comp.key === 'action flow' || comp.key === 'perform actions';
            if (isFreeForm) {
                y = drawFreeFormCompartment(group, element, comp, y, padX, lineHeight, compMeasure);
                continue;
            }
            
            // 일반 리스트 compartment 처리
            const header = ns.Editor.renderUtils.createSvgText(
                element.x + padX, y, 'comp-header', String(comp.key || 'compartment')
            );
            group.appendChild(header);
            y += lineHeight;

            const items = Array.isArray(comp.items) ? comp.items : [];
            for (let ii = 0; ii < items.length; ii++) {
                // items가 객체인 경우 타입 정보 포함하여 레이블 생성
                const itemText = formatCompartmentItemLabel(items[ii]);
                const itemSvg = ns.Editor.renderUtils.createSvgText(
                    element.x + padX + 8, y, 'comp-item', String(itemText ?? ''),
                    { dataCompIndex: ci, dataItemIndex: ii }
                );
                group.appendChild(itemSvg);
                y += lineHeight;
            }
        }
        
        // 크기 조정 - 높이
        const needH = Math.ceil(y - element.y + padX);
        if (needH > element.height) {
            element.height = needH;
            rect.setAttribute('height', String(needH));
            try { app._layoutChanged = true; } catch {}
        }

        // Rule A9: ports 컴파트먼트는 attribute 자식 노드들 아래, 컨테이너 하단에 그린다.
        if (portCompartments.length > 0) {
            let portsLineCount = 0;
            for (const comp of portCompartments) {
                portsLineCount += 1 + (Array.isArray(comp.items) ? comp.items.length : 0);
            }
            const portsH = portsLineCount * lineHeight + 6;

            // 자식(attribute 등) 노드들의 실제 하단 Y를 반영해 ports 섹션을
            // 그 아래에 배치한다 (expandContainerToFitChildren이 아직 반영되지
            // 않은 element.height에 의존하지 않도록).
            let contentBottom = element.y + element.height;
            try {
                const allEls = (app && app.model && Array.isArray(app.model.elements)) ? app.model.elements : [];
                for (const child of allEls) {
                    if (String(child.parent) !== String(element.id)) continue;
                    const cb = Number(child.y || 0) + Number(child.height || 0);
                    if (cb > contentBottom) contentBottom = cb;
                }
            } catch {}

            // ports 섹션을 그릴 공간을 컨테이너 하단에 추가로 확보한다.
            let py = contentBottom + 8;
            element.height = Math.max(element.height, py - element.y) + portsH;
            rect.setAttribute('height', String(Math.ceil(element.height)));
            try { app._layoutChanged = true; } catch {}

            const sep = ns.Editor.renderUtils.createSvgLine(element.x, py, element.x + element.width, py, 'comp-sep');
            group.appendChild(sep);
            py += 6;

            for (const comp of portCompartments) {
                const header = ns.Editor.renderUtils.createSvgText(
                    element.x + padX, py, 'comp-header', String(comp.key || 'compartment')
                );
                group.appendChild(header);
                py += lineHeight;

                const items = Array.isArray(comp.items) ? comp.items : [];
                for (let ii = 0; ii < items.length; ii++) {
                    const itemText = formatCompartmentItemLabel(items[ii]);
                    const itemSvg = ns.Editor.renderUtils.createSvgText(
                        element.x + padX + 8, py, 'comp-item', String(itemText ?? ''),
                        { dataCompIndex: -1, dataItemIndex: ii }
                    );
                    group.appendChild(itemSvg);
                    py += lineHeight;
                }
            }
        }
    }

    // Export
    ns.Editor.render.elements.drawCompartments = drawCompartments;
    ns.Editor.render.elements.drawContainerCompartments = drawContainerCompartments;
    ns.Editor.render.elements.getCompartments = getCompartments;
    ns.Editor.render.elements.buildCompartmentsFromEdges = buildCompartmentsFromEdges;
})();
