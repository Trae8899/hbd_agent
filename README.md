# HBD Thermal Flex Super Agent

HBD Thermal Flex는 복합 화력(CCPP) 및 CHP/Power-to-Heat 구성을 **장치-스트림 그래프**로 모델링하여, 동일 엔진으로 다양한 시뮬레이션과 최적화를 수행하는 그래프 기반 HBD 엔진입니다. 본 리포지토리는 엔진 사양과 에이전트 역할을 문서화하며, API/엔진/UI 컴포넌트가 상호 호환되도록 유지하는 것을 목표로 합니다. 자세한 계산 파이프라인과 플러그인 규약은 [`AGENTS.md`](AGENTS.md)에 정의되어 있으며, 두 문서는 항상 동기화된 상태를 유지해야 합니다.

## 1. 빠른 시작

```bash
# Python 백엔드
pipx install poetry && poetry install
poetry run uvicorn api.app:app --reload  # /simulate, /optimize, /schemas, /palette/units

# Web UI (Vite + React)
cd ui/web && npm install && npm run dev
```

- 실행 결과는 `output/<case>/` 디렉터리에 JSON/Excel/SVG 형태로 저장됩니다.
- 샘플 PlantGraph는 `examples/graphs/` 하위 JSON을 참고하세요.
- 샘플 RunCase 정의는 `examples/run_case/` 디렉터리의 JSON을 참조하세요.
- `examples/graphs/ccpp_base.json`과 `examples/graphs/ccpp_reheat.json`은 각각 비재열/재열 3압력 CCPP 토폴로지를 정의합니다.
- 샘플 그래프를 복제하여 `RunCase` 정의와 함께 `/simulate` 또는 `/optimize` 엔드포인트에 제출하면 바로 실행할 수 있습니다.

## 2. 저장소 구조

```
hbd/
├─ engine/               # Thermo core (numpy + iapws/CoolProp)
├─ api/                  # FastAPI 서비스 엔트리포인트 (/simulate, /optimize, /schemas)
├─ ui/                   # Front-end assets and web canvas UI
├─ defaults/             # 기본 가정값 테이블 및 장치별 초기 조건
├─ schemas/              # /schemas 엔드포인트에서 제공하는 JSON 스키마 모음
├─ examples/graphs/      # 샘플 PlantGraph JSON 그래프
├─ examples/run_case/    # 샘플 RunCase 정의
├─ docs/                 # 상세 스키마 및 설계 문서
└─ ui/
   ├─ palette/           # unit_palette.json에 정의된 캔버스 장치 팔레트
   └─ web/               # React + Vite 기반 그래프 편집기
└─ AGENTS.md             # 에이전트 I/O 계약 및 계산 절차 (본 README와 내용 동기화)
```

## 3. 에이전트 역할 개요

에이전트는 다음 입력을 받아 표준 결과 객체를 생성합니다.

- **입력**: PlantGraph JSON, RunCase 정의
- **출력**: 순출력/효율/열수지/제약 위반, 장치별 포트 상태, 수렴 메타데이터, CHP KPI
- **원칙**
  - 누락된 입력은 `defaults/` 테이블을 기반으로 보수적으로 보완합니다.
  - 모든 물성은 **절대압·SI 단위**로 표현하며, 변수명에 `_abs`, `_kPa_abs` 등 접미사를 명시합니다.
  - 순수 함수형 실행(입력→출력)으로 전역 상태를 회피합니다.
  - 수렴 실패 시에도 partial 결과와 원인을 `violations`/`mass_energy_balance`에 보고합니다.

자세한 계약과 데이터 스키마는 [`AGENTS.md`](AGENTS.md)의 "입력/출력 계약" 절을 참고하세요.

## 4. 데이터 계약 요약

### 4.1 PlantGraph JSON

```json
{
  "meta": {"version": "1.0"},
  "ambient": {"T_C": 30.0, "RH_pct": 60, "P_kPa_abs": 101.3},
  "units": [
    {
      "id": "GT1",
      "type": "GasTurbine",
      "params": {
        "iso_power_MW": 401.8,
        "ISO_heat_rate_kJ_per_kWh": 8470,
        "fuel_LHV_kJ_per_kg": 49000
      }
    },
    {
      "id": "HRSG",
      "type": "HRSG3P",
      "params": {
        "pinch_HP_K": 10,
        "approach_HP_K": 5,
        "pinch_IP_K": 12,
        "pinch_LP_K": 15
      }
    },
    {
      "id": "STG",
      "type": "SteamTurbineIPLP",
      "params": {
        "eta_isentropic": 0.88,
        "mech_efficiency": 0.985,
        "generator_efficiency": 0.985
      }
    },
    {
      "id": "COND",
      "type": "Condenser",
      "params": {
        "cw_in_C": 20,
        "cw_out_max_C": 28,
        "vacuum_kPa_abs": 8
      }
    }
  ],
  "streams": [
    {"from": "GT1.exhaust", "to": "HRSG.gas_in"},
    {"from": "HRSG.hp_sh_out", "to": "STG.hp_in"},
    {"from": "STG.lp_exhaust", "to": "COND.steam_in"},
    {"from": "COND.condensate_out", "to": "HRSG.feedwater_in"}
  ]
}
```

- `units[*].type`은 플러그인 레지스트리 키이며, 동일 인터페이스를 구현하면 새 장치를 자유롭게 추가할 수 있습니다.
- 포트 매질은 `gas`, `steam`, `water` 외에 **`hot_water`, `fuel_gas`**를 지원하여 CHP/난방 루프를 표현합니다.
- `streams`는 Directed Edge로 표현되며, 엔진은 토폴로지 정렬 후 재순환 루프만 수치 반복으로 해결합니다.

#### CHP / 난방 확장 예시 조각

```json
{
  "units": [
    {"id": "DB1", "type": "DuctBurner", "params": {"LHV_kJ_kg": 50000, "target_T_C": 950, "excess_O2_pct": 3}},
    {"id": "HW1", "type": "HotWaterHX", "params": {"supply_set_C": 120, "return_target_C": 70, "UA_kW_K": 5000}},
    {"id": "PBO", "type": "PeakBoilerHW", "params": {"eff_th": 0.9, "max_Q_MW": 80}},
    {"id": "DHN", "type": "ThermalStorageTank", "params": {"V_m3": 5000, "loss_UA_kW_K": 300, "SOC_init": 0.5, "stratified": true}}
  ],
  "streams": [
    {"from": "GT1.exhaust", "to": "DB1.gas_in"},
    {"from": "DB1.gas_out", "to": "HRSG.gas_in"},
    {"from": "HRSG.hw_hot", "to": "HW1.hot_in"},
    {"from": "HW1.cold_out", "to": "DHN.supply"},
    {"from": "DHN.return", "to": "HW1.cold_in"},
    {"from": "PBO.hot_out", "to": "DHN.supply"}
  ]
}
```

### 4.2 재열 CCPP 토폴로지 예시

재열 구성의 경우 HP → 재열 → IP → LP 순서로 증기 흐름을 구성하며, HRSG가 재열 증기를 공급합니다. 상세 연결은 [`examples/graphs/ccpp_reheat.json`](examples/graphs/ccpp_reheat.json)에 수록된 그래프를 참고하세요.

### 4.3 RunCase 정의

```json
{
  "mode": "simulate|optimize",
  "objective": "max_power|min_heat_rate|max_efficiency|max_revenue",
  "pricing": {"power_USD_MWh": 55, "heat_USD_MWh": 25, "fuel_USD_MMBtu": 8},
  "bounds": {
    "GT1.load_pct": [50, 100],
    "HRSG.hp_sh_out_T_C": [520, 600],
    "COND.vacuum_kPa_abs": [6, 12],
    "DB1.fuel_kg_s": [0, 10],
    "HW1.m_dot_hot_kg_s": [0, 200],
    "DHN.SOC": [0.1, 0.9]
  },
  "constraints": {
    "HRSG.stack_T_min_C": 90,
    "HRSG.pinch_HP_min_K": 10,
    "METAL.max_T_C": 600,
    "DHN.supply_min_C": 110,
    "DHN.return_max_C": 80,
    "DHN.heat_demand_MW": 120
  },
  "toggles": {"hrh_bypass_on": false}
}
```

- `objective`는 CHP 수익 최적화를 위해 `max_revenue` 옵션을 추가했습니다.
- `pricing` 블록은 전력/열/연료 단가를 제공하며, `max_revenue` 목적에서 사용합니다.
- 난방 제약은 공급/환수 온도, 열수요(`heat_demand_MW`) 등의 경계 조건을 포함합니다.

### 4.4 결과 객체(Result)

```json
{
  "summary": {
    "GT_power_MW": 401.8,
    "ST_power_MW": 377.8,
    "AUX_load_MW": 6.5,
    "NET_power_MW": 773.1,
    "NET_eff_LHV_pct": 59.2,
    "heat_out_MWth": 95.4,
    "revenue_USD_h": 48850.0
  },
  "violations": ["HRSG.pinch_HP < 10K"],
  "unit_states": {"GT1": {...}, "HRSG": {...}, "STG": {...}, "COND": {...}, "DHN": {...}},
  "mass_energy_balance": {"closure_error_pct": 0.23, "converged": true, "iterations": 6},
  "district_heating": {"DHN_SOC": 0.62, "heat_supply_C": 118.0, "heat_return_C": 72.0},
  "meta": {"timestamp_utc": "...", "solver_commit": "...", "plant_hash": "..."}
}
```

- `district_heating` 블록은 축열 SOC 및 공급/환수 온도를 보고합니다.

## 5. 계산 파이프라인

1. **Compile Graph**: `units`/`streams` 검증 및 포트 매질 호환성 검사 (`gas`, `steam`, `water`, `hot_water`, `fuel_gas`).
2. **Initialize**: 기본값 병합 및 초기 추정치 설정(증기압, 과열온도, 진공, 난방수 공급/환수 온도, 축열 SOC 등).
3. **Block Solvers**: GasTurbine → DuctBurner → HRSG → SteamTurbine → Condenser → HotWater/PeakBoiler → ThermalStorage 순으로 1회 forward pass 수행.
4. **Recycle Iteration**: 재순환/혼합점/Attemperation/난방 루프가 있으면 경계조건 고정 후 Newton-Raphson 또는 Simplex로 수렴.
5. **Plant Summary**: Net MW, LHV 효율, Stack T, Pinch/Approach, 난방 열량, SOC, Revenue/h 등 KPI 산출.
6. **Optimize (옵션)**: SLSQP 기반 탐색을 수행하며 실패 시 다중 시작과 패널티를 적용합니다.

수렴 기준은 `closure_error_pct ≤ 0.5%` 및 모든 inequality 제약 만족입니다.

## 6. 플러그인 규약 및 레지스트리

```python
class UnitBase(Protocol):
    type_key: ClassVar[str]
    ParamModel: Type[BaseModel]  # pydantic
    PortSpec: ClassVar[dict]     # {"in": {name: medium}, "out": {...}}

    def evaluate(self, inputs: dict, params: ParamModel, ambient: Ambient) -> dict:
        """inputs: {port_name: {T_C, P_kPa_abs, h_kJ_kg, m_dot_kg_s, medium}}
        returns: {port_name: {...}} (same schema)
        """
```

- `register_unit(UnitClass)` 호출 또는 `entry_points("hbd.units")` 등록으로 자동 탐지합니다.
- 지원 예시 및 핵심 파라미터/제약:
  - `GasTurbine` — ISO 출력/열효율, 배기가스 온도 제약
  - `DuctBurner` — `fuel_in`(`fuel_gas`), `target_T_C`, `excess_O2_pct`; 제약: StackT, 금속온도
  - `HRSG3P` — Pinch/Approach, Drum 압력 제약
  - `HotWaterHX` — `hot_water` 포트, `supply_set_C`, `return_target_C`, `UA_kW_K`; 제약: 공급온도 상한, 금속온도
  - `PeakBoilerHW` — `fuel_in`, `water_in/out`(`hot_water`), `eff_th`, `max_Q_MW`
  - `ThermalStorageTank` — `V_m3`, `loss_UA_kW_K`, `SOC_init`, `stratified`; 제약: SOC 범위, 열손실
  - `SteamTurbineHP/IP/LP`, `Condenser`, `Pump`, `Mixer`, `Splitter`
  - (옵션) `HeatPumpP2H`, `ExtractionHX` — 레지스트리 키를 예약하여 확장 가능성을 명시
- 포트 `medium`은 물성 모듈 선택을 위해 `gas | steam | water | hot_water | fuel_gas` 중 하나여야 합니다.

## 7. 의사결정변수/제약 매핑

- 경로 표기: `<unit_id>.<param_name>` 또는 `<unit_id>.<port>.<var>`
- `bounds`/`constraints` 항목을 장치 파라미터 또는 포트 상태에 매핑합니다.
- 예시: `"HRSG.hp_sh_out_T_C": [540, 585]`, `"COND.vacuum_kPa_abs": [6, 12]`, `"DHN.SOC": [0.1, 0.9]`.

## 8. 기본값, 제약, 보안 정책

- 스팀터빈 등엔트로피 효율: 0.88, 기계/발전기 효율: 0.985
- HRSG HP pinch 10 K, HP approach 5 K, Stack T 최소 90 °C
- 복수기 진공 초기값 8 kPa(abs), CW in 20 °C, 보조동력 5 MW
- DuctBurner: `excess_O2_pct = 3`, `target_T_C = 900–950 °C`
- District Heating: `supply_set_C = 120 °C`, `return_target_C = 70 °C`, 초기 `SOC = 0.5`
- 누락 시 `defaults/defaults.json`에서 로드하며, 단위 혼용을 금지합니다.
- 벤더 커브/보증 데이터는 비공개 소스로 로드하고 저장소에 커밋하지 않습니다.

## 9. 테스트, 추적성, 산출물

- 모든 Unit 플러그인은 **PyTest 기반 예제 테스트**를 최소 2개 포함해야 합니다.
- 결과에는 `plant_hash`(입력 그래프 SHA-1)와 `solver_commit`을 기록하여 재현성을 확보합니다.
- 산출물: Excel(요약/스트림/로그), SVG(블록 다이어그램), JSON(전체 state)
- UI는 `/schemas` 엔드포인트를 활용해 폼을 자동 구성합니다.

## 10. UI 요약 및 KPI

- 매질 색상: 가스(빨강), 증기/물(파랑), **난방수(주황)**, 연료가스(진회색).
- Canvas UI는 노드 클릭 시 파라미터를 즉시 편집하며 **Auto-Run**으로 0.5초 후 재계산합니다.
- KPI 카드에는 `Heat MWth`, `DHN SOC`, `Supply/Return °C`, `Revenue/h`가 추가되었습니다.
- 최적화 모드 토글: `Simulate / Max Power / Max Efficiency / Max Revenue`.
- 제약 위반 시 노드가 빨간 테두리, 툴팁에 Violation을 표시합니다.

## 11. 로드맵 및 기여 지침

- 향후 과제: Pyomo 기반 제약 최적화, HRH/공랭식 복수기/병렬 HRSG 지원, Pareto Frontier 시각화, Sankey/T-Q Curve, 배관 압력강하/금속온도 모델, HeatPump/ExtractionHX 물성 정합
- PR 규칙: 테스트 필수, README와 `AGENTS.md`/`defaults` 간 문서 동기화 필수
- 라이선스: TBD

---

**문서 동기화 메모**: 본 README에 기술된 사양은 [`AGENTS.md`](AGENTS.md)와 동일한 정보 계층을 유지해야 하며, 변경 시 두 파일을 동시에 갱신하세요.
