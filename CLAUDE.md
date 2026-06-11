# Block Editor — Claude 작업 지침

## 📋 추가 규칙 파일

> 아래 파일을 작업 시작 전에 반드시 읽고 규칙을 준수할 것.

- **`.claude/RENDER_RULES.md`** — 렌더링 규칙

---

## ⚠️ 테스트 파일 보호 규칙 (필수)

**`tests/` 폴더의 JSON 파일은 절대 수정하지 않는다.**

- `tests/test-1.json`, `tests/test-2.json` 등 모든 테스트 데이터 파일은 **읽기 전용**으로 취급한다.
- 디버깅·검증 목적으로도 테스트 파일 내용을 변경하거나 저장하지 않는다.
- 테스트 파일을 수정해야 할 경우 사용자에게 명시적으로 확인을 받은 후에만 진행한다.

---

## ⚠️ Git 작업 규칙 (필수)

**Git 관련 작업은 Claude가 절대 직접 수행하지 않는다. 사용자가 직접 한다.**

- `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git checkout`,
  `git branch`, `git tag`, `git stash`, PR 생성(`gh pr ...`) 등 **저장소 상태를 바꾸는
  모든 git/gh 명령을 실행하지 않는다.**
- 사용자가 명시적으로 "커밋해줘", "푸시해줘"라고 요청해도 직접 실행하지 말고,
  대신 실행할 명령어를 제안만 한다 (사용자가 직접 복사해 실행).
- 읽기 전용 조회(`git status`, `git diff`, `git log`)는 필요 시 사용 가능하다.

## 프로젝트 개요

VS Code 확장으로 동작하는 SysML 블록 다이어그램 에디터.  
JSON 모델 파일(tests/*.json)을 로드해 mxGraph + ELK 기반으로 렌더링한다.

## 핵심 목표: Edge Orthogonal 라우팅 품질 개선

`tests/test-1.json` 등 테스트 파일을 렌더링할 때 엣지의 직교 라우팅 품질을 최대화한다.

### 품질 기준

| 기준 | 설명 |
|------|------|
| 계층적 배치 | containment 관계(Vehicle→PowerTrain→Engine)가 중첩 컨테이너로 명확히 표현 |
| 선 교차 최소화 | 엣지끼리 교차하는 횟수 최소화 |
| 엣지-노드 중첩 없음 | 엣지가 관계 없는 노드 위를 통과하지 않음 |
| 노드 겹침 없음 | 어떤 노드도 다른 노드 위에 겹쳐 배치되지 않음 |
| 경로 단순성 | 꺾임(bend) 횟수 최소화, 가능한 최단 경로 |
| 균일한 간격 | 노드 간 간격이 시각적으로 안정적 |
| 엣지 종단 명확성 | 시작/끝점이 노드 경계에 명확히 연결 |
| 대칭성 | 같은 부모의 자식 노드들은 가능한 대칭 배치 |

### 현재 알려진 문제

- 노드들이 계층 구조를 무시하고 세로로 길게 중첩되어 배치됨
- 일부 노드(Car, Truck, Engine, Actuator 등)가 캔버스 상단에 레이아웃에서 분리된 채 떠 있음
- 일부 노드가 캔버스 영역 밖으로 벗어남
- 엣지가 무관한 노드 위를 통과하며 교차가 많이 발생
- Vehicle→PowerTrain→Engine 같은 전체 계층 구조가 시각적으로 드러나지 않음

---

## 아키텍처 개요

```
src/                        # VS Code 확장 (Node.js)
├── extension.js            # 진입점, 커맨드 등록
├── BlockDiagramPanel.js    # 웹뷰 패널 생성, JSON 로딩
└── panel/
    ├── LanguageServerBridge.js   # JSON 파일 로더
    ├── BlockModelBuilder.js      # 모델 전처리
    └── PanelMessageHandler.js    # 웹뷰 메시지 처리

media/editor/               # 웹뷰 렌더링 (브라우저 JS)
├── boot.js                 # 전체 렌더링 파이프라인 조율
├── core.js                 # EditorApp 클래스
├── hierarchy.js            # 부모-자식 관계 파생
├── layout.js               # 노드 크기 사전계산(precomputeNodeSizes)
├── layout/
│   ├── elkLayout.js        # ELK 레이아웃 어댑터 (핵심)
│   └── alignRanks.js       # ELK 후처리: 같은 rank 노드 수평 정렬
├── mxgraph/
│   ├── MxCellFactory.js    # 렌더링 조율자
│   ├── MxVertexBuilder.js  # 버텍스(노드) 생성
│   ├── MxEdgeBuilder.js    # 엣지 생성
│   └── MxLayoutHelper.js   # mxGraph 레이아웃 헬퍼
└── model/
    └── normalizer.js       # 모델 정규화

tests/
└── test-1.json             # 차량 시스템 테스트 데이터 (primary)
```

노드 종류 (kind)
partdefinition — 부품 정의 (예: Vehicle, Engine, Chassis)
partusage — 부품 사용 인스턴스 (예: engine_p, motor_p)
portdefinition — 포트 정의 (예: PowerPort, ControlPort)
attributedefinition — 속성 정의 (예: maxPower, voltage)

엣지 종류 (kind)
specialization — 상속 관계 (예: Car → Vehicle)
containment — 포함/구성 관계 (예: Vehicle → PowerTrain)
featuretyping — 피처 타이핑 (예: engine_p → Engine)
association — 연관 관계 (예: ECU → Engine)

**기대하는 계층 구조:**
```
Vehicle (root)
├── PowerTrain
│   ├── Engine (← maxPower, maxTorque, PowerPort 포함)
│   ├── ElectricMotor
│   └── Transmission (← PowerPort 포함)
├── Chassis
│   ├── Suspension
│   ├── Brake
│   └── Wheel
└── ControlSystem
    ├── ECU (← ControlPort, DataPort 포함)
    ├── Sensor (← DataPort 포함)
    └── Actuator

Car (specializes Vehicle)
└── BatterySystem
    ├── BMS
    └── BatteryPack
        ├── BatteryCell
        ├── voltage
        └── capacity

Truck (specializes Vehicle)
```
