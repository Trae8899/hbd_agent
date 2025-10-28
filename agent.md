# HBD Super Agent (Graph-based Thermal Flex)

본 문서는 장치 추가/삭제가 자유로운 그래프 기반 HBD 엔진을 Codex로 개발할 때 에이전트의 역할, I/O 계약, 계산 절차, 플러그인 규약을 정의한다. 목표는 기존 “3압력 HRSG 고정형”을 **상위 추상화(장치-스트림 그래프)**로 일반화하여, 동일 엔진으로 다양한 CCPP 구성을 해석·최적화할 수 있게 하는 것이다.

## 1) 역할(Role)

**입력**: 플랜트 장치·연결을 기술한 PlantGraph JSON + 실행 RunCase(환경, 목적함수, 의사결정변수 범위).

**출력**: 순출력/효율/열수지/제약 위반 등 표준 결과 객체와 단위별 상태(각 장치 Port의 P/T/h/ṁ 등).

**동작 원칙**:

- 입력이 불완전하더라도 명시된 기본값 테이블로 보수적으로 보완해 계산을 진행한다.
- 모든 수치는 절대압·SI 단위. 변수명에 `_abs`, `_kPa_abs` 등을 명시.
- 전역 상태를 사용하지 않고, 순수 함수 스타일(입력→출력)을 지향한다.
- 수렴 실패 시에도 partial 결과 + 원인을 반환한다.

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

`units[*].type`은 플러그인 레지스트리 키. 새 장치 추가 시 동일 인터페이스만 만족하면 된다.

`streams`는 Directed Edge. 엔진은 이를 토폴로지 정렬 후 재순환 루프만 수치 반복으로 해결한다.

### 2.2 RunCase (요약)

```json
{
  "mode": "simulate|optimize",
  "objective": "max_power|min_heat_rate|max_efficiency",
  "bounds": {
    "GT1.load_pct": [50, 100],
    "HRSG.hp_shout_T_C": [520, 600],
    "COND.vacuum_kPa_abs": [6, 12]
  },
  "constraints": {
    "HRSG.stack_T_min_C": 90,
    "HRSG.pinch_HP_min_K": 10,
    "METAL.max_T_C": 600
  },
  "toggles": {"hrh_bypass_on": false}
}
```

### 2.3 출력(Result)

```json
{
  "summary": {
    "GT_power_MW": 401.8,
    "ST_power_MW": 377.8,
    "AUX_load_MW": 6.5,
    "NET_power_MW": 773.1,
    "NET_eff_LHV_pct": 59.2
  },
  "violations": ["HRSG.pinch_HP < 10K"],
  "unit_states": {"GT1": {...}, "HRSG": {...}, "STG": {...}, "COND": {...}},
  "mass_energy_balance": {"closure_error_pct": 0.23, "converged": true, "iterations": 6},
  "meta": {"timestamp_utc": "...", "solver_commit": "...", "plant_hash": "..."}
}
```

## 3) 계산 절차(Standard Pipeline)

1. **Compile Graph**: `units`와 `streams`를 검증하고, 포트 타입(가스/물/증기) 호환성 검사.
2. **Initialize**: 기본값 병합, 초기 추정치 생성(증기압·과열온도·진공 등).
3. **Block Solvers**: GasTurbine → HRSG → SteamTurbine → Condenser 순으로 1회 forward pass.
4. **Recycle Iteration**: 재순환/혼합점/Attemperation이 있으면 경계조건 고정 + NR/Simplex로 수렴.
5. **Plant Summary**: Net MW, 효율(LHV), Stack T, Pinch/Approach, 제약 마진 계산.
6. **Optimize(선택)**: SLSQP로 의사결정벡터를 탐색. 실패 시 다중 시작 + 패널티.

수렴 기준: `closure_error_pct ≤ 0.5%` AND 모든 inequality 제약 만족.

## 4) 플러그인(장치) 규약

인터페이스(파이썬 의사코드)

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

등록: `register_unit(UnitClass)` 호출 또는 `entry_points(hbd.units)`로 자동 등록.

예시 타입: GasTurbine, DuctBurner, HRSG3P, BypassValve, Attemperator, SteamTurbineHP/IP/LP, Condenser, Pump, Mixer, Splitter.

Port medium: `"gas"|"water"|"steam"` 등으로 물성 모듈 선택.

## 5) 의사결정변수/제약 바인딩

경로 표기: `<unit_id>.<param_name>` 또는 `<unit_id>.<port>.<var>`.

엔진은 `bounds`/`constraints`를 파라미터 또는 포트 상태에 맵핑한다.

예시: `"HRSG.hp_shout_T_C": [540, 585]`, `"COND.vacuum_kPa_abs": [6, 12]`.

## 6) 기본값 테이블(Default Assumptions)

- 스팀터빈 등엔트로피 효율: 0.88, 기계/발전기 효율: 0.985.
- HRSG HP pinch 10 K, HP approach 5 K, Stack T_min 90°C.
- 복수기 진공 초기치 8 kPa(abs), CW in 20°C, 보조동력 5 MW.
- 누락 시 `defaults/defaults.json`에서 로드.

## 7) 금지/유의

- 단위 혼용 금지(항상 SI, 절대압). 변수명 접미사로 명시.
- 수렴 실패 숨김 금지: `violations`와 `mass_energy_balance`에 상세 기록.
- 벤더 커브/보증은 외부 비밀 데이터로 로드하고 저장소에 커밋 금지.

## 8) 테스트·추적성

- 모든 Unit 플러그인은 최소 2개의 예제 테스트를 포함(PyTest).
- 결과에는 `plant_hash`(입력 그래프 SHA-1)와 `solver_commit`을 기록해 재현성 확보.

## 9) 산출물(Reporter)

- Excel(요약/스트림/계산 로그), SVG(블록 다이어그램), JSON(전체 state) 자동 생성.
- UI는 `/schemas` 엔드포인트를 통해 편집 폼을 자동 구성.
