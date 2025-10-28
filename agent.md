# HBD Super Agent (Graph-based Thermal Flex)

본 문서는 **장치 추가/삭제가 자유로운 그래프 기반 HBD 엔진**을 Codex로 개발할 때 에이전트의 역할, I/O 계약, 계산 절차, 플러그인 규약을 정의합니다. `README.md`는 동일한 내용을 사용자/기여자 관점에서 요약하고 있으며, 두 문서는 항상 동기화된 상태를 유지해야 합니다.

---

## 1) 역할(Role)

- **입력**: 플랜트 장치·연결을 기술한 **PlantGraph JSON** + 실행 **RunCase**(환경, 목적함수, 의사결정변수 범위)
- **출력**: 순출력/효율/열수지/제약 위반 등 **표준 결과 객체**와 단위별 상태(각 장치 Port의 P/T/h/ṁ 등), CHP KPI
- **동작 원칙**
  - 입력이 불완전하더라도 `defaults/`에 정의된 **기본값 테이블**로 보수적으로 보완해 계산을 진행한다.
  - 모든 수치는 **절대압·SI 단위**이며, 변수명에 `_abs`, `_kPa_abs` 등을 명시한다.
  - 전역 상태를 사용하지 않고, **순수 함수 스타일**(입력→출력)을 지향한다.
  - 수렴 실패 시에도 **partial 결과 + 원인**을 `violations`와 `mass_energy_balance`에 기록한다.

---

## 2) 입력/출력 계약

### 2.1 PlantGraph JSON (요약)

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

- `units[*].type`은 **플러그인 레지스트리 키**이며, 인터페이스를 충족하면 새 장치를 자유롭게 추가할 수 있다.
- 포트 `medium`은 `gas | steam | water | hot_water | fuel_gas` 중 하나로 지정하여 CHP/난방 루프까지 표현한다.
- `streams`는 Directed Edge이며, 엔진은 토폴로지 정렬 후 재순환 루프만 수치 반복으로 해결한다.

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

### 2.2 RunCase (요약)

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

- `pricing` 블록은 CHP 수익 계산에 사용되며, `objective = "max_revenue"`일 때 필수다.
- 난방 제약은 공급/환수 온도, 열수요(`heat_demand_MW`) 등으로 구성된다.
- `HRSG.hp_sh_out_T_C`처럼 포트 경로는 철자 일관성을 유지한다 (`hp_shout` 오타 금지).

### 2.3 출력(Result)

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

- `district_heating` 블록은 축열 SOC, 공급/환수 온도 등 난방 KPI를 포함한다.

---

## 3) 계산 절차(Standard Pipeline)

1. **Compile Graph**: `units`와 `streams`를 검증하고, 포트 매질(`gas`, `steam`, `water`, `hot_water`, `fuel_gas`) 호환성을 검사한다.
2. **Initialize**: 기본값 병합, 초기 추정치 생성(증기압·과열온도·진공·난방수 온도·축열 SOC 등).
3. **Block Solvers**: GasTurbine → DuctBurner → HRSG → SteamTurbine → Condenser → HotWater/PeakBoiler → ThermalStorage 순으로 1회 forward pass.
4. **Recycle Iteration**: 재순환/혼합점/Attemperation/난방 루프가 있으면 경계조건 고정 후 Newton-Raphson 또는 Simplex로 수렴.
5. **Plant Summary**: Net MW, 효율(LHV), Stack T, Pinch/Approach, 난방 열량, SOC, Revenue/h 등 KPI 계산.
6. **Optimize(선택)**: SLSQP로 의사결정벡터를 탐색하며, 실패 시 다중 시작과 패널티를 적용한다.

수렴 기준: `closure_error_pct ≤ 0.5%` AND 모든 inequality 제약 만족.

---

## 4) 플러그인(장치) 규약 및 레지스트리

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

- 등록: `register_unit(UnitClass)` 호출 또는 entry_points(`"hbd.units"`)로 자동 등록한다.
- 지원 및 신규 레지스트리 키: `GasTurbine`, `DuctBurner`, `HRSG3P`, `BypassValve`, `Attemperator`, `SteamTurbineHP/IP/LP`, `Condenser`, `Pump`, `Mixer`, `Splitter`, `HotWaterHX`, `PeakBoilerHW`, `ThermalStorageTank`, `HeatPumpP2H`(예약), `ExtractionHX`(예약).
- 핵심 `ParamModel` 속성과 제약 예시:
  - `DuctBurner`: `LHV_kJ_kg`, `target_T_C`, `excess_O2_pct`; 제약 — StackT, 금속온도
  - `HotWaterHX`: `supply_set_C`, `return_target_C`, `UA_kW_K`; 제약 — 공급온도 상한, 금속온도
  - `PeakBoilerHW`: `eff_th`, `max_Q_MW`; 제약 — 연료 사용량, 공급온도
  - `ThermalStorageTank`: `V_m3`, `loss_UA_kW_K`, `SOC_init`, `stratified`; 제약 — SOC 범위, 열손실
  - (예약) `HeatPumpP2H`, `ExtractionHX`: COP/추출비 등 향후 확장 파라미터 명시 예정
- 포트 `medium`은 물성 모듈 선택을 위해 `gas | steam | water | hot_water | fuel_gas` 중 하나여야 한다.

---

## 5) 의사결정변수/제약 바인딩

- 경로 표기: `<unit_id>.<param_name>` 또는 `<unit_id>.<port>.<var>`
- 엔진은 `bounds`/`constraints`를 파라미터 또는 포트 상태에 맵핑한다.
- 예시: `"HRSG.hp_sh_out_T_C": [540, 585]`, `"COND.vacuum_kPa_abs": [6, 12]`, `"DHN.SOC": [0.1, 0.9]`.

---

## 6) 기본값 테이블(Default Assumptions)

- 스팀터빈 등엔트로피 효율: 0.88, 기계/발전기 효율: 0.985
- HRSG HP pinch 10 K, HP approach 5 K, Stack T 최소 90 °C
- 복수기 진공 초기치 8 kPa(abs), CW in 20 °C, 보조동력 5 MW
- DuctBurner: `excess_O2_pct = 3`, `target_T_C = 900–950 °C`
- District Heating: `supply_set_C = 120 °C`, `return_target_C = 70 °C`, 초기 `SOC = 0.5`
- 누락 시 `defaults/defaults.json`에서 로드한다.

---

## 7) 금지/유의 사항

- 단위 혼용 금지: 항상 SI 및 절대압 사용, 변수명에 단위를 접미사로 명시한다.
- 수렴 실패를 숨기지 말고, `violations`와 `mass_energy_balance`에 상세 기록한다.
- 벤더 커브/보증은 외부 비밀 데이터로 로드하고 저장소에 커밋하지 않는다.

---

## 8) 테스트·추적성

- 모든 Unit 플러그인은 최소 2개의 PyTest 예제를 포함한다.
- 결과에는 `plant_hash`(입력 그래프 SHA-1)와 `solver_commit`을 기록해 재현성을 확보한다.

---

## 9) 산출물(Reporter)

- Excel(요약/스트림/계산 로그), SVG(블록 다이어그램), JSON(전체 state) 자동 생성.
- UI는 `/schemas` 엔드포인트를 통해 편집 폼을 자동 구성한다.

---

**문서 동기화 메모**: 본 사양과 [`README.md`](README.md)는 동일한 정보 구조를 공유해야 하며, 변경 시 두 파일을 함께 갱신한다.
