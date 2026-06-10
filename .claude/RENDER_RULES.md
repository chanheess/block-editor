# Block Editor — 렌더링 규칙 (RENDER_RULES)

> 작업 시 이 파일의 규칙을 반드시 준수해야 한다.  
> 코드 변경 전후에 해당 규칙 위반 여부를 확인할 것.

---

## 목적

본 문서는 SysML v2 모델을 블록 에디터에서 렌더링할 때 일관성 있고 가독성이 높은 직교(Orthogonal) 레이아웃을 생성하기 위한 규칙을 정의한다.

레이아웃 엔진은 모든 엣지를 수평 또는 수직 세그먼트로만 구성된 직교 경로로 표현해야 하며, SysML v2의 의미론(Semantics)이 시각적으로 드러나도록 배치해야 한다.

# 1. SysML v2 그래프 모델

## 노드 종류

| Kind | 설명 |
|--------|--------|
| partdefinition | 타입 정의 (Vehicle, Engine, Chassis 등) |
| partusage | 타입의 사용 피처 (engine_p, motor_p 등) |
| portdefinition | 포트 정의 |
| attributedefinition | 속성 정의 |

---

## 엣지 종류

| Kind | 의미 |
|--------|--------|
| specialization | 상속 관계 (is-a) |
| containment | 포함/구성 관계 (has-a) |
| featuretyping | 피처 타입 지정 (typed-by) |
| association | 일반 연관 관계 |

---

# 2. SysML v2 BDD 핵심 원칙

BDD(Block Definition Diagram)는 타입과 타입 간 구조를 표현하는 다이어그램이다.

레이아웃은 다음 의미론적 우선순위를 반드시 따른다.

1. Root Type 배치 = 부모가 없는 최상위 타입 결정
2. specialization = 타입 계층 (is-a)
3. containment = 구조 계층 (has-a)
4. featureTyping = 타입 연결 (typed-by)
5. association = 참조 연결 (reference)

배치 엔진은 반드시 우선순위 순서대로 계층을 구성해야 한다.

예시

Vehicle
├─ Car
├─ Truck
├─ engine
│   ▼
│ Engine
└─ wheel
    ▼
  Wheel

ECU ─────► Engine

---

# 3. 계층 규칙

## Rule H0. 최상위 부모(Root Type) 최상단 배치 [Priority 1]

specialization 관계를 기준으로 부모가 없는 타입(Root Type)은 항상 가장 상단(Y 최소값)에 배치한다.

예시

Vehicle
↓
Car
↓
SportsCar

Shape
↓
Polygon

- 모든 계층 계산의 시작점
- Root Type은 다른 노드보다 위에 배치
- 여러 Root Type이 존재할 경우 동일 Y 레벨에 배치
- specialization 계층 생성 전에 먼저 결정

---

## Rule H1. specialization 우선 [Priority 2]

specialization은 최상위 계층 구조를 형성한다.

Vehicle
↓
Car
↓
SportsCar

- 방향: Top → Bottom
- 타입 계층(depth) 계산 기준
- 레이아웃 우선순위 1순위

---

## Rule H2. containment 배치 [Priority 3]

containment는 부모 타입의 내부 구조를 표현한다.

Vehicle
├─ engine
├─ wheel
└─ body

- 방향: Top → Bottom
- 부모 아래에 배치
- specialization 계층을 깨지 않음

---

## Rule H3. featureTyping 배치 [Priority 4]

featureTyping은 피처와 타입 정의를 연결한다.

Vehicle
└─ engine
    ▼
  Engine

- 방향: Top → Bottom
- 계층 계산에는 사용하지 않음
- containment 이후 연결

---

## Rule H4. association 배치 [Priority 5]

association은 참조 관계이다.

ECU ─────► Engine

- 방향: Left → Right 우선
- 계층 구조에 포함하지 않음
- 가장 마지막에 라우팅

---

# 4. 노드 배치 규칙

## Rule N1. 상속 계층 유지

specialization 트리를 먼저 생성한다.

## Rule N2. 구조 계층 유지

containment 대상은 부모 아래에 배치한다.

## Rule N3. 타입 연결 유지

featureTyping 대상은 사용 피처 아래에 배치한다.

## Rule N4. 참조선 분리

association은 계층 외부에서 연결한다.

## Rule N5. Parent Set Group 기반 대칭 배치

대칭성은 개별 노드가 아니라 Parent Set Group 기준으로 적용한다.

Parent Set Group이란 동일한 부모 집합(parent set)을 공유하는 노드들의 집합이다.

예시

- {Vehicle} → Car, Truck, Bus
- {Shape, Drawable} → Polygon, Circle, Ellipse

배치 규칙

- 동일 Parent Set 노드는 동일 Y 레벨에 배치
- Parent Set Group은 부모들의 평균 CX를 기준으로 대칭 배치
- 대칭성은 개별 노드가 아닌 그룹 단위로 적용
- 전역 충돌 해소 시 그룹 전체를 이동

이 규칙은 단일 상속과 다중 상속 모두에 동일하게 적용된다.

---

# 5. 직교 라우팅 규칙

## Rule O1. 모든 엣지는 직교

수평 또는 수직 세그먼트만 허용한다.

## Rule O2. 최소 Bend

우선순위

1. 0 bend
2. 1 bend
3. 2 bend

3회 이상 bend는 지양한다.

## Rule O3. 교차 최소화

목표 crossing = 0

## Rule O4. 노드 통과 금지

엣지는 관계 없는 노드 영역을 통과할 수 없다.

## Rule O5. 균일한 간격

권장값

- Horizontal spacing = 200px
- Vertical spacing = 150px

---

# 6. SysML v2 의미론 보존 규칙

specialization
→ 타입 계층

containment
→ 구조 계층

featureTyping
→ 피처 타입 연결

association
→ 참조 관계

레이아웃 엔진은 반드시 아래 순서로 처리한다.

Root Type
↓
specialization
↓
containment
↓
featureTyping
↓
association

---

# 7. 레이아웃 품질 평가

## Crossing Score

교차 수가 적을수록 좋다.

## Bend Score

꺾임 수가 적을수록 좋다.

## Symmetry Score

형제 노드 대칭성이 높을수록 좋다.

## Hierarchy Score

specialization / containment 계층 보존 정도.

## Orthogonality Score

직교 비율.

목표 100%.

---

# 8. 다중 부모(Multiple Inheritance) 규칙

SysML v2에서 한 타입이 둘 이상의 타입을 specialization하는 경우 (예: `Polygon → Shape, Drawable, Resizable`).

---

## Rule M1. 다중 부모의 시각적 표현

다중 specialization은 **각 부모마다 별도의 화살표**를 그린다.

```
Shape    Drawable    Resizable
  ↑          ↑           ↑
  └──────────┼───────────┘
           Polygon
```

각 화살표는 독립적인 specialization 관계를 나타낸다.

---

## Rule M2. 다중 부모를 가진 노드의 수평 위치

다중 부모를 가진 노드는 **모든 부모의 중심(평균 CX)** 아래에 배치한다.

```
Shape(CX=120)  Drawable(CX=320)  Resizable(CX=520)
                      ↓
               avgCX = (120+320+520)/3 = 320
                      ↓
              Polygon 배치 x ≈ 320
```

- 부모가 1개일 때: 해당 부모의 CX 바로 아래
- 부모가 2개일 때: 두 부모 CX의 중점 아래
- 부모가 N개일 때: N개 부모 CX의 평균값 아래

---

## Rule M3. Parent Set Group 기반 배치

Parent Set Group이란 동일한 부모 집합(parent set)을 공유하는 노드들의 집합이다.

Rule N5의 Parent Set Group 대칭 규칙을 그대로 적용한다. M3는 다중 상속 환경에서의 추가 규칙만 정의한다.

예시

- {Shape, Drawable} → Polygon, Circle, Ellipse
- {Shape, Drawable, Resizable} → AdvancedPolygon

---

### Rule M3-5. 전역 충돌 해소 우선

Parent Set Group 간 충돌이 발생하는 경우 대칭성보다 노드 중첩 제거를 우선한다.

동일 depth 레벨의 모든 그룹을 대상으로 전역 충돌 해소(global overlap removal)를 수행한다.

우선순위:

1. 노드 중첩 제거
2. 엣지 교차 최소화
3. Parent Set Group 대칭 유지

따라서 Parent Set Group은 중심 위치를 기준으로 이동될 수 있다.

---

### Rule M3-6. 동일 Depth 전역 정렬

같은 depth 레벨의 모든 노드는 desiredX(부모 중심 기반 계산값)를 계산한 뒤 정렬한다.

그 후 좌→우 sweep을 수행하여 겹침을 제거한다.

필요 시 barycenter 재정렬을 수행하여 엣지 교차를 최소화한다.

이 규칙은 다중 상속 구조에서 대칭성과 가독성을 동시에 유지하기 위한 필수 규칙이다.

---

## Rule M4. 레벨(depth) 계산

다중 부모가 있는 경우 레벨은 **모든 부모 중 가장 깊은(longest-path) 레벨 + 1**로 결정한다.

```
Shape(level 0), Drawable(level 0), Resizable(level 0)
→ Polygon의 레벨 = max(0, 0, 0) + 1 = 1

Polygon(level 1)
→ Rectangle의 레벨 = max(1) + 1 = 2

Rectangle(level 2)
→ Square의 레벨 = max(2) + 1 = 3
```

---

## Rule M5. 화살표 스타일

다중 부모로 가는 각 specialization 화살표는 **직교(orthogonal)** 스타일을 유지한다.

- 자식 노드의 상단 중앙(`exitX=0.5, exitY=0`)에서 출발
- 각 부모 노드의 하단(`entryY=1`)에 도달
- `entryX`는 자식의 CX와 부모의 좌우 폭을 기준으로 계산: `(자식CX - 부모X) / 부모Width`
- 엣지 스타일: `orthogonalEdgeStyle`, 개방형 삼각형 화살표(`block`, `endFill=0`)

부모가 자식의 수평 범위 밖에 있을 경우(entryX < 0 또는 > 1) 클램핑(`clamp(0, 1)`)하여 부모의 좌측 또는 우측 모서리에 연결한다.

---

## Rule M6. guiData 위치 복원 금지

커스텀 BDD 레이아웃(`computeCustomBDDLayout`)이 적용된 경우, 이전에 저장된 위치(guiData)를 복원하지 않는다.

- `diagramData._customLayoutApplied = true` 플래그가 설정된 경우 `applyGuiDataPositions` 호출을 건너뜀
- 이 규칙이 없으면 새 레이아웃이 구 좌표로 덮어써지는 무한 루프 발생

---

# 9. 레이아웃 품질 평가

## 평가 항목

### Crossing Score

교차 수

낮을수록 좋음

---

### Bend Score

꺾임 수

낮을수록 좋음

---

### Symmetry Score

형제 노드 대칭성

높을수록 좋음

---

### Hierarchy Score

specialization / containment 계층 보존 정도

높을수록 좋음

---

### Orthogonality Score

직교 비율

목표

100%

---

# 최종 목표

레이아웃 엔진은 다음 조건을 동시에 만족해야 한다.

- specialization 계층 명확화
- containment 구조 명확화
- featureTyping 관계 표현
- association 충돌 최소화
- 노드 중첩 없음
- 엣지 중첩 없음
- 직교 경로 유지
- 최소 bend
- 최소 crossing
- 대칭적 구조 유지