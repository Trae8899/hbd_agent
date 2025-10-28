# HBD Super Agent (Graph-based Thermal Flex)

본 문서는 장치 추가/삭제가 자유로운 그래프 기반 HBD Thermal Flex 엔진을 Codex 에이전트가 다룰 때 따라야 할 역할, I/O 계약, 계산 절차, 플러그인 규약을 정의합니다. 목표는 기존 3압력 CCPP를 **장치-스트림 그래프**로 일반화하여 CHP/Power-to-Heat 구성까지 동일 엔진으로 시뮬레이션/최적화하는 것입니다. README와 본 파일은 항상 동기화된 정보를 유지해야 합니다.

## 1. 역할(Role)

- **입력**: PlantGraph JSON(장치/스트림 토폴로지) + RunCase 정의(운전 조건, 목적, 의사결정변수 경계, 제약).
- **출력**: 순출력·효율·열수지·제약 위반, 장치별 포트 상태, 수렴 메타데이터, CHP KPI(열공급, SOC, 수익 등)를 포함한 표준 Result 객체.
- **동작 원칙**
  - 누락된 입력은 `defaults/` 테이블을 기준으로 보수적으로 채웁니다.
  - 모든 물성은 절대압·SI 단위를 사용하며 변수명에 `_abs`, `_kPa_abs` 등을 명시합니다.
  - 순수 함수 스타일(입력→출력)로 전역 상태를 회피합니다.
  - 수렴 실패 시에도 partial 결과와 원인을 `violations`/`mass_energy_balance`에 보고합니다.

## 2. 입력/출력 계약

### 2.1 PlantGraph JSON

```json
{
  "meta": {"version": "1.0"},
  "ambient": {"T_C": 30.0, "RH_pct": 60, "P_kPa_abs": 101.3},
  "units": [
    {"id": "GT1", "type": "GasTurbine", "params": {"iso_power_MW": 401.8, "ISO_heat_rate_kJ_per_kWh": 8470, "fuel_LHV_kJ_per_kg": 49000}},
    {"id": "HRSG", "type": "HRSG3P", "params": {"pinch_HP_K": 10, "approach_HP_K": 5}},
    {"id": "STG", "type": "SteamTurbineIPLP", "params": {"eta_is_IP": 0.88, "eta_is_LP": 0.88}},
    {"id": "COND", "type": "Condenser", "params": {"cw_in_C": 20, "cw_out_max_C": 28, "vacuum_kPa_abs": 8}}
  ],
  "streams": [
    {"from": "GT1.exhaust", "to": "HRSG.gas_in"},
    {"from": "HRSG.hp_sh_out", "to": "STG.hp_in"},
    {"from": "STG.lp_exhaust", "to": "COND.steam_in"}
  ]
}
```

- `units[*].type`은 플러그인 레지스트리 키이며, 동일 인터페이스를 구현하면 새 장치를 자유롭게 추가할 수 있습니다.
- 포트 `medium`은 `gas | steam | water | hot_water | fuel_gas` 중 하나로 지정하여 물성 모듈을 선택합니다.
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

### 2.2 RunCase 정의

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

- `objective`는 CHP 수익 최적화를 위해 `max_revenue` 옵션을 지원하며 `pricing` 블록을 필요로 합니다.
- 난방 제약은 공급/환수 온도, 열수요, 축열 SOC 범위를 포함합니다.

### 2.3 결과(Result)

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

## 3. 계산 파이프라인

1. **Compile Graph**: `units`/`streams` 유효성 및 포트 매질 호환성(`gas`, `steam`, `water`, `hot_water`, `fuel_gas`).
2. **Initialize**: 기본값 병합 및 초기 추정치 설정(증기압, 과열온도, 진공, 난방수 공급/환수, 축열 SOC 등).
3. **Block Solvers**: GasTurbine → DuctBurner → HRSG → SteamTurbine → Condenser → HotWater/PeakBoiler → ThermalStorage 순으로 forward pass.
4. **Recycle Iteration**: 재순환·혼합점·Attemperation·난방 루프가 있으면 경계조건 고정 후 Newton-Raphson 또는 Simplex로 수렴.
5. **Plant Summary**: Net MW, 효율, Stack T, Pinch/Approach, 난방 열량, SOC, Revenue/h 등 KPI 산출.
6. **Optimize(옵션)**: SLSQP 기반 탐색 수행. 실패 시 다중 시작과 패널티 적용.

수렴 기준은 `closure_error_pct ≤ 0.5%` 및 모든 inequality 제약 만족입니다.

## 4. 플러그인 규약 및 레지스트리

```python
class UnitBase(Protocol):
    type_key: ClassVar[str]
    ParamModel: Type[BaseModel]
    PortSpec: ClassVar[dict]

    def evaluate(self, inputs: dict, params: ParamModel, ambient: Ambient) -> dict:
        """inputs: {port_name: {T_C, P_kPa_abs, h_kJ_kg, m_dot_kg_s, medium}}
        returns: {port_name: {...}} (same schema)
        """
```

- `register_unit(UnitClass)` 호출 또는 `entry_points("hbd.units")` 등록으로 자동 탐지합니다.
- 지원 장치 예시 및 핵심 파라미터/제약:
  - `GasTurbine` — ISO 출력/열효율, 배기가스 온도 제약
  - `DuctBurner` — `fuel_in`(`fuel_gas`), `target_T_C`, `excess_O2_pct`; StackT/금속온도 제약
  - `HRSG3P` — Pinch/Approach, Drum 압력 제약
  - `HotWaterHX` — `hot_water` 포트, `supply_set_C`, `return_target_C`, `UA_kW_K`
  - `PeakBoilerHW` — `fuel_in`, `eff_th`, `max_Q_MW`
  - `ThermalStorageTank` — `V_m3`, `loss_UA_kW_K`, `SOC_init`, `stratified`
  - `SteamTurbineHP/IP/LP`, `Condenser`, `Pump`, `Mixer`, `Splitter`
  - (옵션 확장) `HeatPumpP2H`, `ExtractionHX` — 레지스트리 키 예약
- 모든 포트 `medium`은 명시적으로 지정해야 하며 물성 모듈과 일치해야 합니다.

## 5. 의사결정변수/제약 매핑

- 경로 표기: `<unit_id>.<param_name>` 또는 `<unit_id>.<port>.<var>`.
- `bounds`/`constraints` 항목을 장치 파라미터 또는 포트 상태에 매핑합니다.
- 예시: `"HRSG.hp_sh_out_T_C": [540, 585]`, `"COND.vacuum_kPa_abs": [6, 12]`, `"DHN.SOC": [0.1, 0.9]`.

## 6. 기본값, 초기 추정, 제약

- 스팀터빈 등엔트로피 효율: 0.88, 기계/발전기 효율: 0.985.
- HRSG HP pinch 10 K, HP approach 5 K, Stack T 최소 90 °C.
- 복수기 진공 초기값 8 kPa(abs), CW in 20 °C, 보조동력 5 MW.
- DuctBurner: `excess_O2_pct = 3`, `target_T_C = 900–950 °C` 기본 제약.
- District Heating: `supply_set_C = 120 °C`, `return_target_C = 70 °C`, 초기 `SOC = 0.5`.
- 누락된 데이터는 `defaults/defaults.json`에서 로드하며 단위 혼용을 금지합니다.

## 7. 테스트, 추적성, 산출물

- 모든 Unit 플러그인은 **PyTest 기반 예제 테스트**를 최소 2개 포함해야 합니다.
- 결과에는 `plant_hash`(입력 그래프 SHA-1)와 `solver_commit`을 기록하여 재현성을 확보합니다.
- 산출물: Excel(요약/스트림/로그), SVG(블록 다이어그램), JSON(전체 state).
- UI는 `/schemas` 엔드포인트를 활용해 폼을 자동 구성하며, KPI 카드에 `Heat MWth`, `DHN SOC`, `Supply/Return °C`, `Revenue/h`를 표시합니다.
- Canvas UI는 매질별 색상(가스=빨강, 증기/물=파랑, 난방수=주황, 연료가스=진회색)을 사용하고 Auto-Run으로 0.5초 후 재계산합니다.

## 8. 보안 및 금지 조항

- 벤더 커브/보증 데이터는 비공개 소스에서 로드하고 저장소에 커밋하지 않습니다.
- 수렴 실패 또는 제약 위반을 숨기지 말고 상세 정보를 보고해야 합니다.
- PR 작성 시 테스트 실행과 README ↔ `AGENTS.md` ↔ `defaults` 동기화를 보장합니다.

---

본 파일의 지침을 위반하는 변경은 거부되며, README 수정 시 본 파일도 반드시 함께 갱신해야 합니다.
