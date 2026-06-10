/* ********************************************************************************
 * Copyright: SELab.AI (c) 2026
 * ********************************************************************************/
// Layout service: uses ELK if available, otherwise grid fallback
(function () {
  const ns = (window.SELAB = window.SELAB || {});
  ns.Editor = ns.Editor || {};

  async function run(model) {
    precomputeNodeSizes(model);
    clearElkValues(model);
    // hierarchicalGrid(model); // disabled in favor of dynamic mxGraph layout
  }

  function clearElkValues(model) {
    for (const el of (model.elements || [])) {
      delete el.relativeX;
      delete el.relativeY;
    }
    for (const conn of (model.connections || [])) {
      delete conn.waypoints;
    }
  }

  function precomputeNodeSizes(model) {
    const elements = Array.isArray(model?.elements) ? model.elements : [];
    const edges = Array.isArray(model?.connections) ? model.connections : (Array.isArray(model?.edges) ? model.edges : []);

    // displaySettings에서 노드 사전계산 설정 참조
    const DS = ns.Editor?.config?.displaySettings;
    const NP = DS?.nodePrecompute;
    const minWidth = NP?.minWidth ?? 120;
    const maxWidth = NP?.maxWidth ?? 250;
    const padX = NP?.paddingX ?? 24;
    const lineHeight = NP?.lineHeight ?? 16;
    const vPad = NP?.verticalPadding ?? 30;
    const font = `${DS?.font?.size ?? 12}px ${DS?.font?.family ?? 'sans-serif'}`;

    // getCompartments를 위한 임시 app 객체
    const tempApp = {
      model: {
        elements: elements,
        edges: edges
      }
    };

    // 유틸리티 함수 확인
    const utils = ns.Editor?.utils;
    const hasTextMeasure = !!(utils?.measureTextWidth && utils?.wrapTextToWidth && utils?.getMaxLineWidth);
    const hasMetrics = !!(ns.Editor?.metrics?.calculateTotalNodeHeight);

    for (const el of elements) {
      // collapsed 노드는 최소 크기로 고정하고 스킵
      if (el._collapsed) {
        el.width = 120;
        el.height = 40;
        continue;
      }

      const elType = String(el.type || el.kind || '').toLowerCase();
      
      // Control Node와 TerminateActionUsage는 고정 크기 사용
      const SN = DS?.specialNode;
      if (elType === 'terminateactionusage') {
        el.width = SN?.terminateAction?.width ?? 120;
        el.height = SN?.terminateAction?.height ?? 80;
        continue;
      }
      
      if (elType === 'forknode' || elType === 'joinnode') {
        // 실제 mxGraph 렌더링 크기 사용 (MxLabelUtils에서 수평 막대로 변환)
        el.width = SN?.forkNode?.renderedWidth ?? 80;
        el.height = SN?.forkNode?.renderedHeight ?? 20;
        continue;
      }
      
      if (elType === 'decisionnode' || elType === 'mergenode') {
        el.width = SN?.decisionNode?.width ?? 72;
        el.height = SN?.decisionNode?.height ?? 72;
        continue;
      }
      
      if (elType === 'startaction') {
        el.width = SN?.startAction?.width ?? 28;
        el.height = SN?.startAction?.height ?? 28;
        continue;
      }
      
      // Only compute for leaf nodes; containers will be sized by ELK from children
      // 부모 참조가 id 또는 name으로 올 수 있으므로 둘 다 체크
      const hasKids = elements.some(e => e.parent === el.id || (el.name && e.parent === el.name));
      
      // 컨테이너 노드: compartment 높이를 사전 계산하여 ELK paddingTop에 반영
      if (hasKids) {
        // 제어 구조 컨테이너는 최소 크기 설정
        if (elType === 'loop' || elType.includes('whileloop') || elType.includes('ifaction') || elType.includes('forloop') || elType === 'elseifaction' || elType === 'elseaction') {
          el.width = el.width || (SN?.containerDefault?.width ?? 200);
          el.height = el.height || (SN?.containerDefault?.height ?? 150);
        }

        // 컨테이너의 label+compartment 높이 → ELK paddingTop으로 전달
        if (hasMetrics) {
          let containerComps = el.compartments || [];
          if (containerComps.length === 0 && ns.Editor?.render?.elements?.getCompartments) {
            try {
              containerComps = ns.Editor.render.elements.getCompartments(el, tempApp);
            } catch (e) { /* 무시 */ }
          }
          // action flow compartment 제외 (자식 노드로 렌더링됨)
          // key는 'action flow'(space) 또는 'actionFlow'(camelCase) 두 가지로 올 수 있음
          const textComps = containerComps.filter(c => c.key !== 'action flow' && c.key !== 'actionFlow');
          // Rule A9: ports 컴파트먼트는 attribute 자식 노드들보다 아래쪽에 배치한다.
          // ports는 paddingBottom으로, 나머지(doc 등)는 기존대로 paddingTop으로 예약한다.
          const portComps = textComps.filter(c => c.key === 'ports');
          const topComps = textComps.filter(c => c.key !== 'ports');
          const compHeight = ns.Editor.metrics.calculateTotalCompartmentsHeight(topComps, false, el.width || 200);
          if (compHeight > 0) {
            // compartment 높이만 저장 (basePaddingTop이 이미 label+마진을 포함)
            el._precomputedPaddingTop = compHeight;
          }
          const portHeight = ns.Editor.metrics.calculateTotalCompartmentsHeight(portComps, false, el.width || 200);
          if (portHeight > 0) {
            el._precomputedPaddingBottom = portHeight;
          }
        }
        continue;
      }

      // Comment/Documentation 노드 특별 처리
      const isCommentNode = elType === 'comment' || elType === 'documentation';
      
      if (isCommentNode) {
        // Comment 노드: «comment» + body 텍스트
        const stereotype = elType === 'documentation' ? '«doc»' : '«comment»';
        const bodyText = el.body || '';
        const cleanBody = bodyText.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
        
        // 텍스트 측정이 가능한 경우 정확한 폭 계산
        if (hasTextMeasure) {
          // 스테레오타입 폭
          const stereotypeWidth = utils.measureTextWidth(stereotype, font);
          
          // body 텍스트의 각 줄 폭 계산
          let maxBodyLineWidth = 0;
          if (cleanBody) {
            const bodyLines = cleanBody.split('\n');
            for (const line of bodyLines) {
              const lineWidth = utils.measureTextWidth(line.trim(), font);
              if (lineWidth > maxBodyLineWidth) maxBodyLineWidth = lineWidth;
            }
          }
          
          // 너비 = max(스테레오타입, body 줄들) + 패딩
          const contentWidth = Math.max(stereotypeWidth, maxBodyLineWidth);
          el.width = Math.max(minWidth, Math.min(maxWidth, contentWidth + padX));
        } else {
          // 텍스트 측정 불가 시 body 길이 기반 추정
          if (cleanBody) {
            // body의 가장 긴 줄 길이로 너비 추정 (1글자당 약 7px)
            const bodyLines = cleanBody.split('\n');
            let maxLineLength = 0;
            for (const line of bodyLines) {
              if (line.length > maxLineLength) maxLineLength = line.length;
            }
            const estimatedWidth = Math.max(60, maxLineLength * (NP?.charWidthEstimate ?? 7));
            el.width = Math.max(minWidth, Math.min(maxWidth, estimatedWidth + padX));
          } else {
            el.width = minWidth;
          }
        }
        
        // 높이 = 스테레오타입(1줄) + body 줄 수
        const bodyLineCount = cleanBody ? cleanBody.split('\n').length : 0;
        const totalLines = 1 + bodyLineCount; // stereotype + body lines
        el.height = Math.max(NP?.defaultHeight ?? 40, (totalLines * lineHeight) + vPad);
        
        continue;
      }

      // 1. Compartment 항목들의 최대 폭 먼저 계산
      let maxContentWidth = 0;
      let compartments = [];
      
      if (hasMetrics) {
        compartments = el.compartments || [];

        // getCompartments 사용 (있는 경우)
        if (compartments.length === 0 && ns.Editor?.render?.elements?.getCompartments) {
          try {
            compartments = ns.Editor.render.elements.getCompartments(el, tempApp);
          } catch (e) {
            console.log('[precomputeNodeSizes] getCompartments 실패:', e);
          }
        }

        // Compartment 항목들의 최대 폭 계산
        if (compartments.length > 0) {
          for (const comp of compartments) {
            if (Array.isArray(comp.items)) {
              for (const item of comp.items) {
                // constraint item: keyword + body의 각 줄 폭 계산
                if (typeof item === 'object' && item.keyword && item.body) {
                  const rawBody = (item.body || '').replace(/\r\n/g, '\n').replace(/\t+/g, '    ');
                  const bodyLines = rawBody.split('\n').map(l => l.trim()).filter(Boolean);
                  const charW = NP?.charWidthEstimate ?? 7;
                  // keyword 줄 폭
                  const kwWidth = hasTextMeasure
                    ? utils.measureTextWidth(item.keyword + ' {', font)
                    : (item.keyword.length + 2) * charW;
                  if (kwWidth > maxContentWidth) maxContentWidth = kwWidth;
                  // body 각 줄 폭 (들여쓰기 4칸 포함)
                  for (const line of bodyLines) {
                    const lineText = '    ' + line;
                    const lw = hasTextMeasure
                      ? utils.measureTextWidth(lineText, font)
                      : lineText.length * charW;
                    if (lw > maxContentWidth) maxContentWidth = lw;
                  }
                } else {
                  const itemText = typeof item === 'string' ? item : (item.body || item.label || item.name || '');
                  let itemWidth = 0;
                  if (hasTextMeasure) {
                    itemWidth = utils.measureTextWidth(itemText, font);
                  } else {
                    itemWidth = itemText.length * (NP?.charWidthEstimate ?? 7);
                  }
                  if (itemWidth > maxContentWidth) maxContentWidth = itemWidth;
                }
              }
            }
          }
        }
      }

      // 2. 스테레오타입 + 이름의 폭 계산
      let nodeWidth = minWidth;
      let nodeHeight = NP?.defaultHeight ?? 40;
      
      // 스테레오타입 텍스트
      const stereotype = utils?.getStereotypeText?.(el.type) || '';
      // declaredType이 있으면 실제 렌더링 텍스트 "name : Type" 형태로 계산
      let name = String(el.name || '');
      if (el.declaredType && elType.endsWith('usage') && !name.includes(' : ')) {
        name = `${name} : ${el.declaredType}`;
      }
      
      if (hasTextMeasure) {
        // 정확한 텍스트 측정
        const stereotypeWidth = stereotype ? utils.measureTextWidth(stereotype, font) : 0;
        const nameWidth = name ? utils.measureTextWidth(name, font) : 0;
        const headerWidth = Math.max(stereotypeWidth, nameWidth);
        
        // 헤더와 compartment 중 더 넓은 쪽 선택
        maxContentWidth = Math.max(maxContentWidth, headerWidth);
        
        // 노드 폭 = 최대 컨텐츠 폭 + 패딩 (최소/최대 제한)
        nodeWidth = Math.max(minWidth, Math.min(maxWidth, maxContentWidth + padX));
        
        // 이제 확정된 노드 폭으로 줄바꿈 수행
        const availableWidth = nodeWidth - padX;
        const stereotypeLines = stereotype ? utils.wrapTextToWidth(stereotype, availableWidth, font) : [];
        const nameLines = name ? utils.wrapTextToWidth(name, availableWidth, font) : [];
        
        // 줄바꿈된 텍스트를 요소에 저장 (렌더링 시 사용)
        el._wrappedStereotype = stereotypeLines;
        el._wrappedName = nameLines;
        
        // 노드 높이 = 줄 수 × 라인 높이 + 패딩
        const totalLines = stereotypeLines.length + nameLines.length;
        nodeHeight = Math.max(40, (totalLines * lineHeight) + vPad);
        
      } else {
        // 텍스트 측정 불가 시 문자열 길이 기반 추정
        const charW = NP?.charWidthEstimate ?? 7;
        const stereotypeWidth = stereotype ? stereotype.length * charW : 0;
        const nameWidth = name ? name.length * charW : 0;
        const headerWidth = Math.max(stereotypeWidth, nameWidth);
        
        // 헤더와 compartment 중 더 넓은 쪽 선택
        maxContentWidth = Math.max(maxContentWidth, headerWidth);
        
        // 노드 폭 = 최대 컨텐츠 폭 + 패딩 (최소/최대 제한)
        nodeWidth = Math.max(minWidth, Math.min(maxWidth, maxContentWidth + padX));
      }

      el.width = nodeWidth;
      el.height = nodeHeight;

      // 3a. 보더노드 최소 간격 보장: N/S side 보더노드 개수 기반 최소 폭 계산
      if (el.borderNodes && el.borderNodes.length > 0) {
        const BN = DS?.borderNode;
        const bnSize = BN?.size ?? 12;
        const bnMinSpacing = BN?.minSpacing ?? 16;
        const bnSideMargin = BN?.sideMargin ?? 16;

        // N/S side별 보더노드 개수 집계 (폭에 영향을 주는 side만)
        let maxHorizCount = 0;
        const sideCounts = {};
        for (const bn of el.borderNodes) {
          const side = String(bn.side || 'E').toUpperCase();
          if (side === 'N' || side === 'S') {
            sideCounts[side] = (sideCounts[side] || 0) + 1;
            if (sideCounts[side] > maxHorizCount) maxHorizCount = sideCounts[side];
          }
        }

        if (maxHorizCount > 0) {
          // 필요 최소 폭 = n × (size + minSpacing) - minSpacing + 2 × sideMargin
          const requiredWidth = maxHorizCount * (bnSize + bnMinSpacing) - bnMinSpacing + 2 * bnSideMargin;
          if (requiredWidth > el.width) {
            console.log(`[precomputeNodeSizes] "${el.name}" 폭 확장: ${el.width}→${requiredWidth} (보더노드 최대 ${maxHorizCount}개)`);
            el.width = requiredWidth;
          }
        }
      }

      // 3b. Compartment 및 Border Nodes 높이 추가 계산
      if (hasMetrics && (compartments.length > 0 || (el.borderNodes && el.borderNodes.length > 0))) {
        // 이미 계산된 헤더 높이(nodeHeight)에 compartment와 border nodes 높이 추가
        const compartmentsHeight = ns.Editor.metrics.calculateTotalCompartmentsHeight(compartments, false, nodeWidth);
        const borderNodesHeight = ns.Editor.metrics.calculateBorderNodesHeight(el.borderNodes || []);
        const margin = compartmentsHeight > 0 ? (ns.Editor.config?.displaySettings?.compartment?.margin ?? 8) : 0;
        
        el.height = nodeHeight + compartmentsHeight + borderNodesHeight + margin;
      }
    }
  }

  function grid(model) {
    const DS = ns.Editor?.config?.displaySettings;
    const GS = DS?.grid?.simple;
    const padding = GS?.padding ?? 50;
    const elementWidth = GS?.elementWidth ?? 120;
    const elementHeight = GS?.elementHeight ?? 80;
    const cols = Math.max(1, Math.ceil(Math.sqrt(model.elements.length || 1)));
    (model.elements || []).forEach((element, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      element.x = padding + col * (elementWidth + padding);
      element.y = padding + row * (elementHeight + padding);
      element.width = element.width || elementWidth;
      element.height = element.height || elementHeight;
    });
  }

  /**
   * 계층 구조를 고려한 그리드 레이아웃 (ELK 비활성화 시 사용)
   * 후위 순회(post-order DFS)로 자식 먼저 배치 후 부모 크기 확장
   */
  function hierarchicalGrid(model) {
    const DS = ns.Editor?.config?.displaySettings;
    const GS = DS?.grid?.simple;
    const outerPad = GS?.padding ?? 50;
    const defW = GS?.elementWidth ?? 120;
    const defH = GS?.elementHeight ?? 80;
    const childPad = 20;
    const headerH = 40; // 컨테이너 상단 label 영역 높이

    const elements = model.elements || [];

    // parent→children 맵 구성
    const childrenOf = new Map();
    for (const el of elements) {
      if (el.parent) {
        if (!childrenOf.has(el.parent)) childrenOf.set(el.parent, []);
        childrenOf.get(el.parent).push(el);
      }
    }

    /**
     * 후위 순회: 자식을 먼저 재귀 처리한 뒤 부모 내부에 배치
     * @param {Object} node - 현재 노드
     */
    function layoutNode(node) {
      const children = childrenOf.get(node.id) || [];

      // 1. 자식 노드를 먼저 재귀 처리 (후위 순회)
      for (const child of children) {
        layoutNode(child);
      }

      if (!children.length) return;

      // 2. 자식 내부 그리드 배치
      const childCols = Math.max(1, Math.ceil(Math.sqrt(children.length)));
      const maxChildW = Math.max(...children.map(c => c.width || defW));
      const maxChildH = Math.max(...children.map(c => c.height || defH));

      children.forEach((child, i) => {
        const col = i % childCols;
        const row = Math.floor(i / childCols);
        child.relativeX = childPad + col * (maxChildW + childPad);
        child.relativeY = headerH + childPad + row * (maxChildH + childPad);
        // 절대좌표 동기화 (손자 노드 배치에 필요)
        child.x = (node.x || 0) + child.relativeX;
        child.y = (node.y || 0) + child.relativeY;
      });

      // 3. 부모 크기를 자식 수용 가능하도록 확장
      const usedCols = Math.min(children.length, childCols);
      const usedRows = Math.ceil(children.length / childCols);
      const requiredW = childPad + usedCols * (maxChildW + childPad);
      const requiredH = headerH + childPad + usedRows * (maxChildH + childPad);
      node.width = Math.max(node.width || defW, requiredW);
      node.height = Math.max(node.height || defH, requiredH);
    }

    // 루트 노드(parent 없는 노드) 추출
    const roots = elements.filter(el => !el.parent);

    // 루트 노드 각각에 대해 후위 순회 실행 (자식 크기/위치 확정)
    for (const root of roots) {
      root.width = root.width || defW;
      root.height = root.height || defH;
      layoutNode(root);
    }

    // 루트 노드를 외부 그리드에 배치
    const outerCols = Math.max(1, Math.ceil(Math.sqrt(roots.length || 1)));
    let currentX = outerPad;
    let currentY = outerPad;
    let rowMaxH = 0;

    roots.forEach((el, i) => {
      el.x = currentX;
      el.y = currentY;
      rowMaxH = Math.max(rowMaxH, el.height);

      if ((i + 1) % outerCols === 0) {
        currentX = outerPad;
        currentY += rowMaxH + outerPad;
        rowMaxH = 0;
      } else {
        currentX += el.width + outerPad;
      }
    });

    // 루트 배치 후 자식들의 절대좌표 재동기화 (루트 x/y가 확정된 시점)
    for (const root of roots) {
      syncAbsoluteCoords(root, childrenOf);
    }
  }

  /**
   * 루트 위치 확정 후 모든 자식의 절대좌표(x/y)를 재귀적으로 동기화
   */
  function syncAbsoluteCoords(node, childrenOf) {
    const children = childrenOf.get(node.id) || [];
    for (const child of children) {
      child.x = (node.x || 0) + (child.relativeX || 0);
      child.y = (node.y || 0) + (child.relativeY || 0);
      syncAbsoluteCoords(child, childrenOf);
    }
  }

  ns.Editor.layout = { run, grid, hierarchicalGrid, precomputeNodeSizes };
})();
