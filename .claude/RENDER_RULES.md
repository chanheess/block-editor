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
- Definition → Usage 구조를 형성
- featureTyping보다 우선 배치

---

### Rule H2-1. specialization 이후 처리

containment는 specialization 계층이 완전히 생성된 이후 적용한다.

처리 순서

```
Root Type
↓
specialization
↓
containment
```

containment는 기존 타입 계층을 변경할 수 없다.

---

### Rule H2-2. containment depth 계산

containment child의 depth는 다음과 같이 계산한다.

```
child.depth = parent.depth + 1
```

---

### Rule H2-3. Definition → Usage → Definition 구조 유지

```
Vehicle
 └─ engine
      ▼
   Engine
```

Vehicle = Definition
engine  = Usage
Engine  = Definition

레이아웃은 반드시 이 구조를 보존해야 한다.

---

### Rule H2-4. containment subtree 단위 배치

containment child와 그 하위 featureTyping 대상은 하나의 subtree로 계산한다.

---

### Rule H2-5. containment 형제 대칭 배치

동일 부모의 containment child들은 부모 중심 기준으로 대칭 배치한다.

---

### Rule H2-6. containment 폭 계산

```
parent.width = Σ(child subtree width)
```

---

### Rule H2-7. containment 우선, featureTyping 종속

containment를 먼저 배치한 후 featureTyping을 연결한다.

featureTyping은 containment 위치를 변경할 수 없다.

---

### Rule H2-8. Parent Set Group 계산 제외

containment 관계는 Parent Set Group 계산 대상이 아니다.

Parent Set Group 계산은 specialization 관계에만 적용한다.

---

### Rule H2-9. Containment Anchor 우선

containment child는 containment parent를 기준으로 배치한다.

specialization 관계는 containment child의 소속(container)을 변경할 수 없다.

예)

```
Canvas
 └ Layer
      └ Rectangle
```

이면 Rectangle은 반드시 Layer 내부에 있어야 한다.

```
Rectangle
  ▲
Polygon
```

은 타입 관계일 뿐, Rectangle을 Layer 밖으로 이동시킬 권한이 없다.

---

### Rule H2-10. Containment Boundary 불변

containment parent의 경계(boundary)는 모든 containment child를 포함해야 한다.

Layer 안의 Rectangle/Circle/Triangle이 이동하면 Layer.width/Layer.height를 재계산해야 한다.

---

### Rule H2-11. Specialized Child 고정

containment child가 specialization 노드인 경우에도, 우선적으로 containment 위치를 따른다.

예)

```
Layer
 └ Rectangle  ─specialization→ Polygon
```

배치 결과: `Layer └ Rectangle` 유지, Polygon은 참조 대상처럼 연결만 한다.

---

### Rule H2-12. Containment Dominance

containment와 specialization이 동일 노드에 대해 충돌하면 containment가 우선한다.

실제 위치 결정 우선순위:

```
containment > specialization > featureTyping > association
```

---

### Rule H2-13. Containment Child Relocation 금지

containment child는 specialization 레이아웃 단계에서 재배치(reposition)할 수 없다.

허용: Polygon/Rectangle/Triangle 간 specialization edge routing

금지: Rectangle.x, Circle.x, Triangle.x 등 containment child의 위치 변경

즉 specialization은 노드를 이동하는 것이 아니라 엣지를 표현하는 역할만 해야 한다.

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

### Rule H3-1. FeatureTyping은 계층 생성 금지

featureTyping은 타입 참조(type reference) 관계이며, containment(소유) 또는
specialization(상속) 관계가 아니다.

featureTyping은 새로운 depth를 생성하지 않는다. 다음과 같은 계산은 금지한다.

```
typed.depth = feature.depth + 1
```

featureTyping은 specialization 및 containment 계층 계산(부모-자식 관계, depth,
subtree 소속)에 참여하지 않는다.

예) `Vehicle └ engine ▼ Engine` 에서 `Engine`을 `Vehicle`의 자식으로 취급하지
않는다.

### Rule H3-2. FeatureTyping 위치 종속

typed node(예: `Engine`)는 source feature(예: `engine`)의 위치를 변경할 수 없다.

feature의 위치는 containment(H2)가 결정하며, typed node는 feature 위치에
종속적으로(부속적으로) 연결될 뿐이다.

예) `Vehicle └ engine ▼ Engine` 에서 `Engine`의 존재가 `engine.x`, `engine.y`를
변경해서는 안 된다. (H2-7의 확장)

### Rule H3-3. FeatureTyping Subtree

feature와 typed node는 하나의 subtree로 계산한다.

```
engine ▼ Engine
maxPower ▼ Power
portA ▼ PowerPort
```

feature subtree의 폭(width) 계산 시 typed node를 포함한다. (H2-4와 연결)

### Rule H3-4. Shared Type 병합

동일한 typed node는 하나만 렌더링한다.

featureTyping 관계가 여러 feature로부터 동일 타입(예: `engine`, `backupEngine`,
`spareEngine` → 모두 `Engine`)을 참조하더라도, 타입 정의 노드는 중복 생성하지
않는다.

### Rule H3-5. FeatureTyping 교차 최소화

featureTyping은 source feature의 바로 아래에 연결하는 것을 우선한다.

우선순위:

1. 수직 연결
2. 동일 subtree 내부 연결
3. 최소 bend
4. 최소 crossing

(O3/O4/O6~O8 라우팅 규칙과 연결)

### Rule H3-6. FeatureTyping Zone

featureTyping은 Structure Zone 내부에서 처리한다.

featureTyping은 Type Hierarchy Zone을 생성하지 않는다. 즉, typed node가
specialization 노드여도 featureTyping 관계 때문에 Zone A(Type Hierarchy
Zone)로 이동시키지 않는다.

예) `Canvas └ Layer └ engine ▼ Engine` 에서 `Engine`이 specialization
계층의 일부여도, featureTyping만으로 Zone A로 옮기는 것은 금지한다.

### Rule H3-7. FeatureTyping Dominance

featureTyping과 specialization이 충돌하는 경우 specialization이 우선한다.

featureTyping과 containment가 충돌하는 경우 containment가 우선한다.

우선순위:

```
containment > specialization > featureTyping > association
```

(H2-12의 확장)

---

## Rule H4. association 배치 [Priority 5]

association은 참조 관계이다.

ECU ─────► Engine

- 방향: Left → Right 우선
- 계층 구조에 포함하지 않음
- 가장 마지막에 라우팅

SysML v2 BDD 의미론상 각 관계의 역할은 다음과 같이 구분된다.

```
containment   = 소유 (has-a)
featureTyping = 타입 참조 (typed-by)
specialization = 상속 (is-a)
association   = 참조 (reference)
```

association은 reference 관계이므로 위치 결정 권한, 계층 생성 권한, container 생성
권한을 갖지 않는다.

### Rule H4-1. Association은 계층 생성 금지

association은 reference 관계이다.

association은 새로운 depth를 생성하지 않는다. 다음과 같은 계산은 금지한다.

```
target.depth = source.depth + 1
```

association은 specialization, containment, featureTyping 계층 계산에 참여하지
않는다. (H3-1 대응 규칙)

### Rule H4-2. Association 위치 영향 금지

association은 source와 target의 위치를 변경할 수 없다.

노드 위치는 다음 단계에서 이미 결정되어야 한다.

```
Root → specialization → containment → featureTyping
```

association은 routing(엣지 경로 계산)만 수행한다.

예) `RenderEngine ─────► Rectangle` 관계가 있다고 해서 `Rectangle.x`를 변경해서는
안 된다.

### Rule H4-3. Association Zone 이동 금지

association은 노드를 다른 Zone(L1~L7의 Zone A: Type Hierarchy, Zone B: Structure)
으로 이동시킬 수 없다.

association은 Zone 간 연결(엣지)만 수행한다.

예) `Square ───► Rectangle` 관계가 있다고 해서 `Square`를 `Canvas` 안으로 이동
시켜서는 안 된다.

### Rule H4-4. Association Dominance

association은 가장 낮은 우선순위를 가진다.

```
containment > specialization > featureTyping > association
```

(H2-12/H3-7과 동일한 우선순위를 association 장에서도 명시)

### Rule H4-5. Association Crossing 회피

association은 다음 우선순위로 라우팅한다.

1. 기존 계층(containment/specialization/featureTyping 배치 결과) 보존
2. 노드 통과 금지
3. 컨테이너 내부 통과 금지
4. 최소 crossing
5. 최소 bend

예) `ECU ─────► Engine` 엣지가 `maxPower`/`maxTorque`/`Transmission` 위로 지나가서는
안 된다. (O3/O4와 연결)

### Rule H4-6. Association Boundary Routing

association이 containment container를 가로질러야 하는 경우, 컨테이너 내부를
통과하지 않고 외곽선을 따라 우회한다.

예) `Canvas { Layer, RenderEngine }` 구조에서 `RenderEngine ─► Rectangle`이면,
`Canvas` 내부 관통보다 `Canvas` 외곽 우회를 우선한다. (O8과 연결)

### Rule H4-7. Association Anchor

association은 source와 target의 가장 가까운 외곽(anchor)을 사용한다.

우선순위:

1. 동일 레벨 → 좌우 연결
2. 상하 레벨 → 수직 연결
3. 최소 거리 anchor

이 규칙이 없으면 `Rectangle` 왼쪽에 있는 노드가 `Rectangle` 오른쪽으로 연결되는
비합리적인 경로가 발생할 수 있다.

### Rule H4-8. Shared Association Channel

동일 방향으로 진행하는 association은 가능하면 동일 routing channel을 공유한다.

목표: crossing 감소, bend 감소, 가독성 향상. (O7 Channel Routing과 연결)

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

## Rule O6. Container Bbox 통과 금지

association 및 featureTyping 엣지는 관계 없는 노드의 bbox를 통과할 수 없다.

```
edge segment ∩ node bbox = ∅  (단, 자신의 source/target 노드는 제외)
```

---

## Rule O7. Channel Routing

엣지는 노드 간 여백(채널) 영역을 우선 사용한다.

우선순위

1. 수평 채널 (형제 노드 사이의 수평 여백)
2. 수직 채널 (레벨/레이어 간 수직 여백)
3. 컨테이너 외곽

---

## Rule O8. Structure Zone Boundary Routing

association 또는 featureTyping 엣지가 containment 영역(Structure Zone)을 가로질러야 하는 경우, 컨테이너 내부를 통과하지 않고 컨테이너 외곽선을 따라 우회한다.

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

# 9. Layout Zone Rules

BDD 레이아웃은 두 개의 좌표 영역(Zone)으로 구성된다. 두 Zone은 서로 겹칠 수 없다.

- **Zone A — Type Hierarchy Zone**: specialization으로 형성되는 타입 계층 (Shape/Drawable/Resizable/Polygon/Rectangle/Triangle/Square 등)
- **Zone B — Structure Zone**: containment/featureTyping/association으로 형성되는 구조 계층 (Canvas/Layer/Rectangle/Circle/Triangle/RenderEngine 등)

```
Zone A (Type Hierarchy)        Zone B (Structure)

Shape Drawable Resizable       Canvas
      │                         ├ Layer
   Polygon                      │   ├ Rectangle
   /      \                     │   ├ Circle
Rectangle Triangle              │   └ Triangle
   │                            └ RenderEngine
 Square
```

---

## Rule L1. Zone 분리

렌더링 공간을 Type Hierarchy Zone(A)과 Structure Zone(B)으로 구분한다.

두 Zone의 bbox는 겹칠 수 없다.

---

## Rule L2. Structure Zone 우선 확보

containment root(예: Canvas)가 존재하면, 먼저 Structure Zone(Zone B)의 bbox를 확정한다.

그 다음 Type Hierarchy Zone(Zone A)의 노드들을 Zone B와 겹치지 않는 영역에 배치한다.

즉, specialization은 containment 영역을 침범할 수 없다.

---

## Rule L3. Free Specialization Node 분리

containment parent가 없는 specialization 노드(예: Square, RightTriangle, EquilateralTriangle)는 Type Hierarchy Zone(Zone A)에만 존재해야 한다.

Structure Zone(Canvas/Layer 등)의 bbox 내부에 들어갈 수 없다.

---

## Rule L4. Container Collision 금지

모든 specialization 노드의 bbox는 모든 containment container의 bbox와 교차할 수 없다.

```
specNode.bbox ∩ container.bbox = ∅
```

---

## Rule L5. Containment Child 우선권 (H2-13 연동)

containment child(예: Layer의 자식인 Rectangle/Circle/Triangle)는 specialization 배치 단계에서 좌표 변경이 금지된다.

specialization 배치 단계는 containment parent가 없는 노드(Polygon, Shape, Drawable, Resizable, Square, RightTriangle, EquilateralTriangle 등)만 다룬다.

---

## Rule L6. Dual Role Node 단일 렌더링

containment child이면서 동시에 specialization 노드인 경우(Rectangle/Circle/Triangle), 노드는 containment 위치에 한 번만 그린다.

specialization 관계(예: Rectangle → Polygon)는 엣지로만 표현하며, 별도의 specialization 위치에 중복 렌더링하지 않는다.

---

## Rule L7. Virtual Specialization Layout

Dual Role Node(Rectangle/Circle/Triangle 등)가 containment 내부에 위치하더라도, specialization 레벨/배치 계산 시에는 해당 노드의 실제 위치를 가상 좌표(virtual position)로 참조한다.

이 가상 좌표를 기준으로 Free Specialization Node(Square 등)의 위치를 계산하여, Zone B(Structure Zone)를 침범하지 않도록 한다.

---

# 10. 레이아웃 품질 평가

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