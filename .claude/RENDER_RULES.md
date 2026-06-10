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

# 2.5. PartDefinition / PartUsage 규칙

## Rule D1. PartDefinition은 타입 노드이다.

partdefinition은 SysML v2 BDD의 기본 타입(Type)을 나타낸다.

다음 관계의 기준 노드가 된다.

- specialization
- containment
- featureTyping의 typed node
- association

BDD 계층 계산의 기준은 항상 partdefinition이다.

## Rule D2. PartDefinition은 containment root가 될 수 있다.

containment 관계의 parent는 기본적으로 partdefinition으로 간주한다.

partdefinition은 Structure Zone의 루트가 될 수 있다.

## Rule D3. Definition과 Usage는 구분한다.

partdefinition은 타입이다.

partusage는 타입의 사용 피처이다.

partusage는 partdefinition과 동일한 계층으로 배치할 수 없다.

partusage는 Definition을 참조(featureTyping)할 수 있으나
Definition 자체를 대체할 수 없다.

## Rule D4. PartDefinition 우선 렌더링

partdefinition의 위치는
specialization 및 containment 규칙으로 먼저 결정한다.

partusage의 위치는
featureTyping 단계에서 결정한다.

partusage는 partdefinition의 위치를 변경할 수 없다.
(H3-2와 연동)

## Rule D5. Shared PartDefinition 단일 렌더링

동일한 partdefinition은 BDD 내에서 한 번만 렌더링한다.

여러 partusage가 동일 partdefinition을 참조하더라도
partdefinition 노드를 복제하지 않는다.

예)

```text
engine_p
backupEngine_p
testEngine_p
      ▼
    Engine
```

Engine은 1개만 그린다. (H3-4와 연동)

## Rule D6. PartUsage는 Feature이다.

partusage는 타입(Type)이 아니라 Feature이다.

partusage는 구조(Containment)에 의해 소유되며,
featureTyping을 통해 타입을 참조한다.

예)

```text
Vehicle
 └ engine
      ▼
   Engine
```

여기서 `Vehicle = PartDefinition`, `engine = PartUsage`,
`Engine = PartDefinition`이다.

partusage는 specialization 계층의 구성원이 아니다.

## Rule D7. PartUsage는 Root Type이 될 수 없다.

partusage는 Root Type(H0)가 될 수 없다.

다음 계산에서 제외한다.

- Root Type 결정
- specialization depth 계산
- Parent Set Group 계산

즉 `engine`, `motor`, `wheel` 등은
Type Hierarchy Zone의 루트가 될 수 없다.

## Rule D8. PartUsage는 소유자(Owner)에 종속된다.

partusage의 위치는 소유자(containment parent)에 의해 결정된다.

예) `Vehicle └ engine`이면 `engine`의 위치는
`Vehicle` 내부에서만 결정된다.

partusage는 자신의 typed node 위치를 변경할 수 없다.
(H3-2와 연동)

## Rule D9. PartUsage는 Structure Zone에만 존재한다.

partusage는 항상 Structure Zone(B)에 속한다.

partusage는 Type Hierarchy Zone(A)으로 이동할 수 없다.

예) `engine ▼ Engine`에서 `engine`은 Vehicle 내부에 존재해야 하며,
`Engine`이 specialization 계층에 속하더라도
`engine` 자체가 Zone A로 이동해서는 안 된다.
(L1~L7과 연동)

## Rule D10. Top-Level PartUsage 보정

containment parent가 없는 partusage는
featureTyping target 근처에 배치한다.

우선순위

1. typed node 근처
2. 최소 crossing
3. 최소 bend
4. 동일 Y 정렬

예) 최상위에 떠 있는 `engine_p`를
`Engine`의 상단 또는 좌측 근처에 배치한다.

```text
engine_p
   │
   ▼
 Engine
```

단, containment / specialization 배치를 변경해서는 안 된다.
(H3-5 확장 — `engine_p`, `circle_p`, `layer_p`, `rect_p`가
화면 구석에 떠 있던 문제가 이 규칙의 부재로 발생한 현상)

## Rule D11. PartUsage Dominance

PartUsage는 위치 결정 권한을 갖지 않는다.

우선순위

```text
containment
>
specialization
>
featureTyping(target type)
>
partusage(feature)
>
association
```

즉 `engine_p` 때문에 `Engine`을 이동시키면 안 된다.
반대로 `Engine`이 이미 위치가 결정되어 있다면
`engine_p`가 이동하는 것은 허용된다.
(H2-12 / H3-7 / H4-4 Dominance 계열과 연동)

---

# 2.6. PortDefinition 규칙

## Rule P1. PortDefinition은 Definition이다.

portdefinition은 SysML v2의 Port Type이다.

PortDefinition은 PartDefinition과 동일하게 Definition 계열 노드로 취급한다.

예)

```text
GeomPort
ColorPort
RenderPort
```

PortDefinition은 다음 관계의 target이 될 수 있다.

- featureTyping
- containment
- association
- specialization

## Rule P2. PortDefinition은 Type Hierarchy Root가 아니다.

PortDefinition은 Definition이지만 BDD의 주요 타입 계층(Type Hierarchy) 계산 대상은 아니다.

다음 계산에서 제외한다.

- Root Type 결정
- Parent Set Group 계산
- Structure Zone 계산

즉

```text
Shape
 └ ColorPort
```

에서 ColorPort가 Shape 위로 올라가면 안 된다.

## Rule P3. PortDefinition은 Owner 내부에 존재한다.

PortDefinition이 containment 관계를 가지면 반드시 Owner 내부에 존재해야 한다.

예)

```text
Rectangle
 └ GeomPort
```

이면 GeomPort는 Rectangle 내부에 배치한다.

```text
GeomPort
```

를 Rectangle 밖에 별도 렌더링하면 안 된다.

(H2-9, H2-10 연동)

## Rule P4. Shared PortDefinition 단일 렌더링

동일 PortDefinition은 한 번만 렌더링한다.

예)

```text
Rectangle ──► GeomPort
Circle ─────► GeomPort
```

GeomPort는 하나만 존재한다.

다음은 금지.

```text
Rectangle
 └ GeomPort

Circle
 └ GeomPort
```

(복제)

이는 D5 Shared Definition과 동일한 원칙이다.

## Rule P5. PortDefinition은 Structure Zone에 속한다.

PortDefinition은 항상 Owner의 Structure Zone 내부에 존재한다.

```text
Canvas
 └ Layer
     └ Rectangle
         └ GeomPort
```

GeomPort는 Rectangle 내부에 존재해야 한다.

PortDefinition 때문에 Type Hierarchy Zone을 생성하면 안 된다.

## Rule P6. PortDefinition Dominance

PortDefinition은 위치 결정 권한을 가지지 않는다.

우선순위

```text
containment
>
specialization
>
featureTyping
>
portdefinition
>
association
```

PortDefinition 때문에 Owner 노드를 이동시키면 안 된다.

반대로 Owner 위치가 결정되면 PortDefinition이 이동하는 것은 허용된다.

## Rule P7. Shared Definition 우선

PortDefinition이 여러 Owner에 의해 공유되더라도

```text
Rectangle ─► GeomPort
Circle ─────► GeomPort
```

PortDefinition은 복제하지 않는다.

대신

```text
Rectangle
      \
       \
        GeomPort
       /
      /
Circle
```

처럼 Shared Definition으로 유지한다.

(D5 확장 규칙)

## Rule P8. PortDefinition은 FeatureTyping Target 우선

PortDefinition은 일반적으로 FeatureTyping의 target 역할을 수행한다.

예)

```text
powerPort
     ▼
 PowerPort
```

여기서 `powerPort`는 PartUsage, `PowerPort`는 PortDefinition이다.

PortDefinition은 FeatureTyping에 의해 이동하지 않는다.

(H3-2 연동)

## Rule P9. PortDefinition은 AttributeDefinition보다 우선 (권장)

```text
Rectangle
 ├ width
 ├ height
 ├ color
 └ GeomPort
```

포트는 속성과 다른 영역으로 취급한다.

권장 배치

```text
Rectangle
├ Attributes
│  ├ width
│  ├ height
│  └ color
│
└ Ports
   └ GeomPort
```

즉

```text
attribute
port
attribute
port
```

처럼 섞어 배치하지 않는다.

이 규칙이 있어야 향후 SysML v2 BDD와 IBD 스타일 모두 확장하기 쉽다.

---

# 2.7. AttributeDefinition 규칙

## Rule A1. AttributeDefinition은 Definition이다.

attributedefinition은 SysML v2의 Value Definition이다.

예)

```text
maxPower
maxTorque
voltage
capacity
radius
width
height
```

AttributeDefinition은 Definition 계열 노드로 취급한다.

## Rule A2. AttributeDefinition은 Root Type이 아니다.

AttributeDefinition은 Definition이지만 BDD의 주요 타입 계층(Type Hierarchy)을 구성하지 않는다.

다음 계산에서 제외한다.

- Root Type 결정
- Parent Set Group 계산
- Structure Root 계산

즉

```text
Engine
 └ maxPower
```

에서

```text
maxPower
   ▲
 Engine
```

처럼 되면 안 된다.

## Rule A3. AttributeDefinition은 Owner 내부에 존재한다.

AttributeDefinition이 containment 관계를 가지면 반드시 Owner 내부에 존재해야 한다.

예)

```text
Engine
 ├ maxPower
 ├ maxTorque
 └ fuelType
```

이면 모든 AttributeDefinition은 Engine 내부에 배치한다.

Owner 밖으로 이동시키면 안 된다.

(H2-9 / H2-10 연동)

## Rule A4. AttributeDefinition은 Structure Zone에 속한다.

AttributeDefinition은 항상 Owner의 Structure Zone 내부에 존재한다.

```text
Vehicle
 └ Engine
     ├ maxPower
     └ maxTorque
```

maxPower와 maxTorque는 Engine 내부에 존재해야 한다.

Type Hierarchy Zone을 생성해서는 안 된다.

(L1~L7 연동)

## Rule A5. Shared AttributeDefinition 단일 렌더링

동일 AttributeDefinition은 한 번만 렌더링한다.

예)

```text
Rectangle ─► color
Circle ─────► color
```

color는 하나만 존재한다.

다음은 금지.

```text
Rectangle
 └ color

Circle
 └ color
```

(복제)

D5 Shared Definition 규칙을 따른다.

## Rule A6. AttributeDefinition은 FeatureTyping Target이 될 수 있다.

예)

```text
maxPower
    ▼
 Power
```

여기서 `maxPower = AttributeDefinition`, `Power = Value Type`이다.

AttributeDefinition은 FeatureTyping 관계를 가질 수 있다.

단, FeatureTyping은 AttributeDefinition의 위치를 변경할 수 없다.

(H3-2 연동)

## Rule A7. AttributeDefinition Dominance

AttributeDefinition은 위치 결정 권한을 가지지 않는다.

우선순위

```text
containment
>
specialization
>
featureTyping
>
attributeDefinition
>
association
```

AttributeDefinition 때문에 Owner를 이동시키면 안 된다.

반대로 Owner 위치가 결정된 후 AttributeDefinition이 이동하는 것은 허용된다.

## Rule A8. AttributeDefinition은 Specialization Zone을 생성하지 않는다.

AttributeDefinition이 specialization 관계를 가지더라도 독립적인 Type Hierarchy Zone을 만들지 않는다.

예)

```text
Power
 ▲
RatedPower
```

는 가능하지만,

```text
Shape
Polygon
Rectangle
Power
RatedPower
```

처럼 별도 타입 계층 축을 만들지는 않는다.

AttributeDefinition 계열 specialization은 Owner 내부 또는 Value-Type Cluster 내부에서만 표현한다.

## Rule A9. AttributeDefinition은 PortDefinition보다 우선 배치

Owner 내부 배치 순서

```text
Attributes
↓
Ports
```

권장 구조

```text
Rectangle
├ Attributes
│  ├ width
│  ├ height
│  ├ color
│
└ Ports
   └ GeomPort
```

즉

```text
width
GeomPort
height
ColorPort
```

처럼 섞지 않는다.

## Rule A10. Attribute Cluster 유지

동일 Owner의 AttributeDefinition들은 하나의 Attribute Cluster로 묶어 배치한다.

예)

```text
Engine
 ├ maxPower
 ├ maxTorque
 ├ rpm
 └ voltage
```

우선순위

1. 동일 Owner
2. 동일 Y 영역
3. 최소 간격
4. 좌측 정렬

속성끼리 흩어져 배치하는 것을 금지한다.

## Rule A11. AttributeDefinition은 Leaf Node이다.

AttributeDefinition은 기본적으로 Leaf로 취급한다.

즉 `maxPower` 아래에 다시 containment subtree를 생성하지 않는다.

예외:

```text
maxPower
   ▼
 Power
```

같은 FeatureTyping 연결만 허용한다.

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

## Rule O9. Edge Type Routing Priority

모든 엣지는 관계 종류별 전용 채널을 가진다.

우선순위

```
specialization > containment > featureTyping > association
```

- 상위 우선순위 엣지는 더 직선적이고 짧은 경로(채널)를 우선 차지한다.
- 하위 우선순위 엣지는 상위 엣지의 경로/채널을 피해 우회 경로를 선택한다.
- 동일 영역에서 specialization, association, featureTyping 엣지가 같은 채널을 공유하여 시각적으로 섞이지 않도록 한다.

---

## Rule O10. Specialization Spine

BDD에서 타입 계층(specialization)은 가장 우선되는 시각 요소이며, 하나의 "Spine"(축)을 형성한다.

- 동일 depth의 specialization edge들은 공통 수직 채널(vertical channel)을 공유한다.
- specialization edge는 association/featureTyping보다 우선적으로 직선 경로를 사용한다.
- 여러 부모를 specialize하는 경우(M1~M3 참고), 부모들은 자식 위에 나란히 배치되고 specialization edge들은 다음과 같은 Spine 형태를 이룬다.

```
Shape   Drawable   Resizable
   \       |          /
         Polygon
```

---

## Rule O10-1. Type Hierarchy Zone 수직 정렬

Type Hierarchy Zone(specialization 상위 노드 묶음)은 항상 캔버스 최상단(START_Y)에서
시작해 아래로 쌓이므로, 캔버스 중앙에 위치한 dual-role 자식(Triangle/Circle/Rectangle
등)과 수직으로 어긋나 cross-container specialization 엣지가 긴 대각선이 된다.

- 별도 Structure Zone이 존재하는 경우(`structureZoneBBox`가 있는 Canvas/Organization/
  System류), Zone 전체를 Structure Zone과 **수직 중심이 맞도록 통째로(rigid) 이동**해
  cross-container 엣지를 짧고 수평에 가깝게 만든다.
- 위로 올려 음수 좌표가 되는 것은 방지한다(`START_Y` 위로는 올리지 않음).
- Vehicle처럼 `structureZoneBBox=null`(별도 Structure Zone 없음)인 경우는 적용하지 않는다.

> 구현 위치: `elkLayout.js` (spec 레벨 배치 루프 종료 후 `movableSpecIds` 전체를
> `safeDy`만큼 `moveSubtree`).

---

## Rule O10-2. Crossing Minimization (반복 barycenter 정렬)

다중 상속(노드 하나가 여러 상위를 specialize, 예: Polygon→Shape/Drawable/Resizable)이
있으면 단일 패스 정렬(level0=자식 기준, 하위=부모 기준)은 상하 레벨의 좌우 순서가
어긋나 엣지가 부채꼴로 교차한다.

- 각 레벨 내 **이동 가능한** spec 노드의 좌우 순서를 인접 레벨(부모/자식)의 평균
  위치 기준으로 정한다. down 스윕(부모 평균) → up 스윕(자식 평균)을 반복(5회)하면
  양쪽 레벨 순서가 수렴해 교차가 줄어든다.
- dual-role(컨테이너 자식) 노드는 실제 위치(pixel)에 **고정**해 barycenter 기준점으로만
  사용한다. 순서만 재정렬할 뿐 노드를 컨테이너 밖으로 빼지 않으므로 H2(containment)·
  L1/L4(zone) 규칙을 침범하지 않는다.
- `structureZoneBBox`가 있을 때만 적용한다(이미 안정적인 Vehicle류는 미적용).

> 구현 위치: `elkLayout.js` (배치 루프 직전 `baryOrder` 산출, 루프 내 `movableNodes`
> 정렬에 `baryOrder` 우선 사용 · 없으면 기존 M3 `avgParentCX`).

---

## Rule O11. FeatureTyping Locality

featureTyping 엣지는 source feature(예: `engine`)와 typed definition(예: `Engine`) 사이의 **국소(local) 연결**을 유지해야 한다.

배치 우선순위

1. typed node 바로 위/아래에 feature를 배치
2. typed node와 동일 container 내부에 배치
3. 최소 bend(꺾임) 경로
4. 최소 crossing(교차) 경로

허용 조건: `feature ↔ typed node` 거리는 Local Radius(예: 인접 노드 1~2칸 이내) 이하여야 한다. 이를 초과하는 길게 늘어진 featureTyping 엣지(예: `engine → RenderEngine`, `layer → Layer`, `circle → Circle`, `rect → Rectangle`처럼 캔버스를 가로지르는 형태)는 금지되며, feature 노드를 typed node에 인접하도록 재배치한다.

---

## Rule O12. Container Escape Routing

association 또는 featureTyping 엣지가 containment container 경계를 벗어나야 하는 경우, 다음 순서로 라우팅한다.

1. source container의 boundary까지 이동
2. boundary를 따라 이동(Boundary Routing, O8 참고)
3. target container의 boundary로 진입

컨테이너(Canvas, Layer, Rectangle, Circle 등) 내부를 가로질러 무관한 노드 위를 통과하는 경로는 금지된다.

---

## Rule O13. Edge Crossing Cost

라우팅 경로 선택은 다음 비용 함수를 최소화하는 방향으로 이루어진다.

```
Cost =
    1000 × nodeOverlap
  +  500 × containerCrossing
  +  100 × edgeCrossing
  +   10 × bendCount
  +        pathLength
```

- `nodeOverlap`: 엣지가 무관한 노드 위를 통과하는 횟수
- `containerCrossing`: 엣지가 무관한 컨테이너 경계를 가로지르는 횟수
- `edgeCrossing`: 다른 엣지와 교차하는 횟수
- `bendCount`: 꺾임 횟수
- `pathLength`: 경로 길이

여러 라우팅 후보 중 Cost가 최소인 경로를 선택한다.

---

## Rule O14. Orthogonal Quality Score

전체 라우팅 품질은 다음 가중 점수로 평가한다.

```
Score =
    40% Crossing
  + 20% Node Clearance
  + 15% Bend Count
  + 10% Symmetry
  + 10% Hierarchy Preservation
  +  5% Edge Length
```

각 항목은 0~100 정규화 점수이며, 전체 Score를 최대화하는 레이아웃을 목표로 한다.

---

## Rule O15. Edge Anchor Consistency

엣지 종류별로 시작/종단 anchor를 고정하여, 동일 관계는 항상 동일한 anchor 규칙을 따른다.

| 관계 | 시작(anchor) | 종단(anchor) |
|------|---------------|---------------|
| specialization | child.top | parent.bottom |
| containment | child.top | parent.bottom |
| featureTyping | source.bottom → target.top (단, O15-1 참고) |
| association | nearest side anchor (가장 가까운 변) |

---

## Rule O15-1. featureTyping Anchor 동적화 + Stale Waypoint 제거

H3에 의해 typed node가 feature 바로 아래에 배치되는 것이 일반적이지만(O15: source.bottom →
target.top), 그렇지 않은 경우(같은 레벨/옆쪽 배치 등) bottom→top 고정 anchor를 그대로
쓰면 엣지가 자기 자신이나 다른 노드 위를 가로지르게 된다.

1. **Anchor 고정(S→N)**: H3(Case A/B)는 항상 typed를 feature 바로 아래에 배치하므로
   featureTyping은 dx/dy 비교 없이 항상 source.bottom → target.top(O15, S→N)으로
   고정한다. typed가 컨테이너일 때 width가 넓어지면 dx가 커져 association처럼
   nearest-side(H4-7, W/E)로 잘못 선택될 수 있는데, 이 경우 엣지가 박스를
   휘감는 루프가 생기므로 dx/dy 비교 분기를 사용하지 않는다.

2. **Stale ELK Waypoint 제거**: featureTyping 엣지는 ELK가 계산한 원본 waypoints/
   geometry.points를 사용하지 않는다. M2~M8 재배치 이후 stale point가 남아 있으면
   exit/entry anchor와 무관하게 그 점을 거쳐가는 우회 경로(요동/오버슈트)가 생기므로,
   featureTyping(non-border) 엣지는 항상 anchor만으로 직선(orthogonal) 연결한다.

3. **수직 정렬 보정**: source/target의 width가 달라 중심(0.5/0.5) anchor의 절대 X가
   미세하게 어긋나면, 짧은 구간에서 `jettySize=auto`(orthogonalEdgeStyle)가 작은
   루프를 그리는 현상이 생긴다. entry X를 source 중심의 절대 X에 맞춰 exit/entry의
   절대 X를 일치시키고, `jettySize=0`으로 고정해 완전한 수직 직선을 만든다.
   typed가 컨테이너인 경우 `resizeParentsToFitChildren()`(자식을 모두 포함하도록
   부모 크기 보정)이 엣지 생성 직전에 실행되어 elkLayout 시점의 width(`_ftEntryX`)와
   달라질 수 있으므로, `MxEdgeBuilder.createEdge`에서 **현재(최종) 셀 geometry
   기준으로 entryX를 다시 계산**한다.

> 구현 위치: `elkLayout.js` (association 앵커 계산 루프에 featuretyping 추가, `_ftExit`/`_ftEntry`
> 항상 S/N 고정 + `_ftEntryX` 저장 + stale waypoint 무조건 폐기), `MxEdgeBuilder.js`
> (`_ftEntryX` 기반 entry anchor + `jettySize=0`, featureTyping non-border 엣지는
> `applyElkWaypoints` 미적용).

---

## Rule O15-2. Association/Connector Anchor 고정 + Stale Waypoint 제거

association/connector 엣지가 `orthogonalEdgeStyle`의 기본 exit/entry(자유 anchor)와
ELK가 계산한 stale waypoints를 그대로 사용하면, 막는 노드가 없어도 화면을 크게
우회하는 사각형 경로(예: Engine→Transmission, RenderEngine→Rectangle)가 생긴다.

1. **Anchor 고정(side anchor)**: source/target 중심의 dx/dy를 비교해 더 가까운
   쪽 면을 `_assocExit`/`_assocEntry`(N/S/E/W)로 고정하고, featureTyping과 동일하게
   `sideExitStyle`/`sideEntryStyle` + `orthogonalLoop=0;jettySize=0`을 적용해
   단일 꺾임의 짧은 경로를 만든다.

2. **Stale ELK Waypoint 제거**: association/connector 엣지는 featureTyping과
   동일하게 ELK의 원본 `edge.waypoints`/`geometry.points`를 사용하지 않는다
   (`hasElkWaypoints`를 association/connector에 대해 항상 false로 처리). stale
   waypoint가 남아있으면 anchor를 고정해도 그 점을 거쳐가는 큰 우회 경로가
   강제로 삽입된다.

> 구현 위치: `elkLayout.js`(association/connector 앵커 계산 루프, 기존 `_assocExit`/
> `_assocEntry` 계산 재사용), `MxEdgeBuilder.js`(`isAssocOrConnector`일 때
> `hasElkWaypoints=false` 강제, `_assocExit`/`_assocEntry` → side anchor +
> `orthogonalLoop=0;jettySize=0` 적용).

---

## Rule O16. Edge Rendering Pipeline

엣지 관련 규칙(O9~O15)은 서로 독립적이지 않으며, 다음 파이프라인 순서로 적용되어야 한다. 순서를 어기면 (예: Spine 계산 후 Boundary Routing이 Spine을 깨뜨리는 등) 규칙 간 충돌이 발생할 수 있다.

```
Node Layout (D/P/A/H/L 규칙 적용 완료)
  ↓
O11. FeatureTyping Locality   — feature 노드를 typed 인접으로 재배치
  ↓
O15. Edge Anchor Consistency  — 관계별 anchor(시작/종단점) 결정
  ↓
O12. Container Escape Routing — Boundary Routing 적용 (O6/O8 구현)
  ↓
O10. Specialization Spine     — 확정된 라우팅 위에서 specialization 축 정렬
  ↓
O9. Edge Type Routing Priority — 관계별 채널(channel) 배정
  ↓
O13. Edge Crossing Cost        — 비용 함수 기반 최종 최적화
  ↓
Edge Rendering
```

요약: **배치 → Anchor → Routing → Spine → Channel → Cost → 렌더링** 순서를 따른다.

---

## Rule O17. Specialization Parent Filtering (M7/L7 구현)

O10(Specialization Spine) 계산에서 `movableNodes`의 `avgParentCX`(M3)는, 부모 노드가 Zone B(Structure Zone)에 고정된 Dual Role Node(예: `Triangle`)인 경우 그 노드의 **실제 CX가 아닌 L7 가상 CX**를 사용한다.

구현 위치: `elkLayout.js`의 specialization 레벨별 배치 루프에서 `fixedNodes`의 `nodeCX`를 다음과 같이 계산한다.

```js
for (const nid of fixedNodes) {
  const pars = specParentsOf.get(nid) || [];
  if (pars.length > 0) {
    // L7: 실제 좌표 대신 자신의 specialization 부모 CX 평균(가상 좌표)을 사용
    nodeCX.set(nid, avg(pars.map(p => nodeCX.get(p))));
  } else {
    nodeCX.set(nid, 실제 CX);
  }
}
```

이 가상 CX가 하위 레벨(`RightTriangle`, `EquilateralTriangle`, `Square` 등)의 `avgParentCX` 계산에 그대로 사용되므로, Zone B에 고정된 부모는 별도의 "제외 분기" 없이도 자동으로 Zone A 좌표(M7의 dominant parent CX)에 수렴한다.

> 효과: `Square`/`RightTriangle`/`EquilateralTriangle`이 더 이상 Zone A-B 사이 빈 공간으로 끌려가지 않고 `Polygon` 축 주변에 정렬된다 (검증 완료, 2026-06-11 스크린샷).

---

## O-Rule 적용 우선순위

현재 렌더링 결과(엣지 교차/관통 다수)를 개선하기 위한 적용 순서:

1. **O11. FeatureTyping Locality** — `engine→RenderEngine`, `layer→Layer`, `circle→Circle`, `rect→Rectangle` 같은 장거리 featureTyping 엣지를 제거하고, feature 노드를 typed node 바로 위/아래에 인접 배치한다 (D10/H3-5 위반 동시 해소). ROI 최고, 1순위.
2. **O15. Edge Anchor Consistency** — specialization/containment는 child.top→parent.bottom, featureTyping은 source.bottom→target.top으로 anchor를 통일한다. 구현 난이도가 낮고, O11과 결합 시 선 모양이 즉시 안정된다. 2순위.
3. **O12. Container Escape Routing** — Canvas/Layer/Rectangle/Circle 내부 관통을 제거한다. 이는 새로운 의미론이 아니라 기존 **O6(Container Bbox 통과 금지) + O8(Boundary Routing)의 실제 구현**이며, O3(Crossing)/O4(Node Overlap) 위반의 직접 원인을 해소한다. 현재 체감 문제(엣지가 노드/컨테이너 위를 지나감)가 Spine 미흡보다 심각하므로 3순위.
4. **O10. Specialization Spine** — `Shape/Drawable/Resizable → Polygon`, `Polygon/Triangle/Circle → ...` 같은 specialization 계층을 공통 수직 채널(Spine)로 정리한다. O12(라우팅 규칙 확정) 이후에 적용해야 Boundary Routing이 다시 Spine을 깨뜨리는 일을 방지할 수 있다. 4순위.
5. **O9. Edge Type Routing Priority** — specialization/containment/featureTyping/association 채널 분리. O11/O15/O12/O10이 선행되지 않으면 효과가 작으므로 5순위.
6. **O13. Edge Crossing Cost** — 위 5개 적용 후 남는 교차를 비용 함수(A*/Orthogonal Router 수준) 기반으로 최소화. 가장 마지막.

> 참고: O11 + O15 적용만으로도 현재 화면의 엣지 품질이 체감상 60~70% 개선될 것으로 예상되나, O13까지 가야 완료로 볼 수 있다. O12를 O10보다 먼저 적용해 라우팅 규칙을 먼저 확정한 뒤, 그 위에서 O10(Specialization Spine)을 안정적으로 구성한다.

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

## Rule M7. Dominant Parent Rule (Zone 간 다중 부모 위치 결정)

다중 부모(M2)가 서로 다른 Zone(Zone A: Type Hierarchy, Zone B: Structure)에 걸쳐 있을 경우, M2의 단순 평균(`avgCX`)을 그대로 적용하면 자식 노드가 두 Zone 사이의 빈 공간으로 끌려가 두 부모 모두에게 긴 우회 엣지가 생긴다.

이를 방지하기 위해 **위치 결정에 사용할 부모(dominant parent)** 를 다음 우선순위로 선정한다:

1. Type Hierarchy Zone(Zone A)의 Free Specialization Node (예: `Polygon`)
2. Containment-fixed Dual Role Node (예: `Triangle`) — 단, Rule L7(Virtual Specialization Layout)에 의해 보정된 가상 CX를 사용
3. 그 외 부모

`Triangle`처럼 Zone B에 고정된 Dual Role Node도 L7을 통해 자신의 specialization 부모(Polygon)의 CX를 가상 CX로 가지게 되므로, 결과적으로 M2의 평균 계산은 모든 부모가 사실상 같은 Zone A 좌표(Polygon CX)로 수렴한다 — 별도의 "부모 제외" 분기 없이 M2 + L7만으로 M7이 satisfy된다.

```
Triangle.virtualCX = avgParentCX(Triangle) = Polygon.CX   (L7)
RightTriangle.x    = avg(Triangle.virtualCX, Polygon.CX)
                    = avg(Polygon.CX, Polygon.CX)
                    = Polygon.CX                          (M7 결과)
```

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

## Rule L8. Dual Role Projection (L7의 정식화)

Dual Role Node(예: `Triangle`)는 두 개의 좌표를 동시에 가진다.

- **실제 좌표** (`x`, `y`): containment(Layer 등)에 의해 결정되는 Zone B 위치. 렌더링은 이 좌표로만 이루어진다.
- **Projection 좌표** (`_specVirtualCX`, `_specVirtualCY`): specialization 부모(Polygon)의 spine 축 위에 있는 Zone A 가상 위치(`Triangle*`). 별도 노드로 렌더링하지 않는다.

> RightTriangle을 "Triangle 아래"로 옮기면 L3(Free Specialization Node는 Zone A)와
> L4(Spec Node ∩ Container 금지)를 위반한다 — Triangle이 Layer 내부(Zone B)에
> 있으므로 그 바로 아래는 Zone B 영역이기 때문이다. L8은 Triangle의 실제 위치는
> 그대로 두고, specialization 계산에만 쓰이는 `Triangle*`(Projection)을 Zone A에
> 별도로 두어 이 충돌을 피한다.

```
Semantic Parent:  RightTriangle → Triangle   (SysML 의미론, 렌더링 불필요)
Layout Parent:    RightTriangle → Triangle*  (배치/엣지 계산용 가상 부모)
```

---

## Rule M8. Projection Parent Rule (M7의 정식화)

Free Specialization Node(RightTriangle, EquilateralTriangle 등)의 부모가 Dual Role
Node인 경우, M2/M3(평균 부모 CX)는 부모의 **실제 좌표가 아니라 L8 Projection
좌표(`Triangle*`)** 를 사용한다.

```
Polygon
   ▲
Triangle*  (L8 projection: _specVirtualCX/_specVirtualCY)
   ▲
RightTriangle  (M8: Triangle*의 CX/CY 기준으로 배치)
```

> 구현: O17(`fixedNodes`의 `nodeCX` 계산)이 이미 이 규칙을 구현한다.

---

## Rule O18. Projection Edge Collapse (L7-1의 정식화)

`RightTriangle -> Triangle` 같은 specialization 엣지의 entry 지점은 Triangle의
실제 박스 경계가 아니라 **`Triangle*`(Projection) 위치**(`_specVirtualCX`,
`_specVirtualCY + height`)로 "투영(collapse)"한다. `Triangle*`는 화면에 그려지지
않으므로, 결과적으로 엣지는 RightTriangle 바로 위 Polygon spine 축 위의 한 점에서
끝나며, RightTriangle은 M8에 의해 이미 그 축 위에 배치되어 있으므로 짧은 직선
엣지가 된다.

> 구현: M5 + L7-1 anchor 계산(`targetHasVirtual` 분기)이 이미 이 규칙을 구현한다.
> O12(Container Escape Routing)는 이 엣지에는 적용하지 않는다(2점 직선 강제).

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