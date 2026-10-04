#!/usr/bin/env bash
# 端到端验证：抢单 / 升级 / 权限 / 完整时间线
set -u
BASE=http://localhost:3000/api
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (期望 $1 实际 $2)"; fi; }

login(){ curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d "{\"username\":\"$1\"}" | sed 's/.*"token":"\(u[0-9]*\)".*/\1/'; }
T_DUTY=$(login duty); T_M1=$(login medic1); T_M2=$(login medic2); T_M3=$(login medic3); T_AD=$(login admin)
# 动态解析各账号的数据库 ID（重置库后自增 ID 会变）
uidof(){ curl -s $BASE/users -H "Authorization: Bearer $T_AD" | python3 -c "import json,sys;print([u['id'] for u in json.load(sys.stdin) if u['username']=='$1'][0])"; }
ID_M1=$(uidof medic1); ID_M2=$(uidof medic2); ID_M3=$(uidof medic3)
echo "令牌: duty=$T_DUTY medic1=$T_M1 medic2=$T_M2 medic3=$T_M3 admin=$T_AD | DB ID m1=$ID_M1 m2=$ID_M2 m3=$ID_M3"
lower(){ tr 'A-Z' 'a-z'; }

code(){ curl -s -o /tmp/resp.json -w '%{http_code}' -H "Authorization: Bearer $2" "${@:3}"; }
jget(){ python3 -c "import json,sys;d=json.load(open('/tmp/resp.json'));print(eval(sys.argv[1]))" "$1" 2>/dev/null; }

echo; echo "=== 场景1：值班员最小表单报警（不写长报告即可派人）==="
curl -s -X POST $BASE/incidents -H "Authorization: Bearer $T_DUTY" -H 'Content-Type: application/json' \
  -d '{"location":"测试-羽毛球场","occurredAt":"2026-10-04T09:00","victimBrief":"男性约20岁，小腿拉伤","initialHandlerNote":"待接单"}' > /tmp/inc_race.json
RACE_ID=$(python3 -c "import json;print(json.load(open('/tmp/inc_race.json'))['id'])")
RACE_CODE=$(python3 -c "import json;print(json.load(open('/tmp/inc_race.json'))['code'])")
echo "  新事件 $RACE_CODE (id=$RACE_ID)，系统已向急救员推送 App 通知"

echo; echo "=== 场景2：三名急救员同一瞬间抢单 ==="
curl -s -X POST $BASE/incidents/$RACE_ID/accept -H "Authorization: Bearer $T_M1" > /tmp/r1.json &
curl -s -X POST $BASE/incidents/$RACE_ID/accept -H "Authorization: Bearer $T_M2" > /tmp/r2.json &
curl -s -X POST $BASE/incidents/$RACE_ID/accept -H "Authorization: Bearer $T_M3" > /tmp/r3.json &
wait
WINS=$(grep -l '"won":true' /tmp/r1.json /tmp/r2.json /tmp/r3.json | wc -l)
LOSERS=$(grep -h '"won":false' /tmp/r1.json /tmp/r2.json /tmp/r3.json | wc -l)
check 1 $WINS "并发抢单恰有 1 人成功"
check 2 $LOSERS "其余 2 人落败"
WINNER_NUM=1
[ -f /tmp/r2.json ] && grep -q '"won":true' /tmp/r2.json && WINNER_NUM=2
[ -f /tmp/r3.json ] && grep -q '"won":true' /tmp/r3.json && WINNER_NUM=3
echo "  → 获胜者: medic$WINNER_NUM"
# 第四个迟到的请求也必须失败
curl -s -X POST $BASE/incidents/$RACE_ID/accept -H "Authorization: Bearer $T_M1" > /tmp/r4.json
check false "$(python3 -c "import json;print(json.load(open('/tmp/r4.json'))['won'])" | lower)" "迟到重复接单被拒绝"
HANDLER=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $T_M1" | python3 -c "import json,sys;print(json.load(sys.stdin)['currentHandler']['name'])")
case "$WINNER_NUM" in 1) check "王急救" "$HANDLER" "唯一有效接手人已落库";; 2) check "赵急救" "$HANDLER" "唯一有效接手人已落库";; 3) check "孙急救" "$HANDLER" "唯一有效接手人已落库";; esac

echo; echo "=== 场景3：完整处置时间线 + 自动升级 ==="
WIN_TOKEN="T_M$WINNER_NUM"; WIN_TOKEN=${!WIN_TOKEN}
# 现场评估判定高风险 → 自动升级
curl -s -X POST $BASE/incidents/$RACE_ID/assess -H "Authorization: Bearer $WIN_TOKEN" -F 'content=小腿后侧肿胀压痛，无法站立，疑似跟腱部分断裂，疼痛剧烈伴出汗' -F 'severity=HIGH' -F 'escalateReason=疑似跟腱断裂，运动功能严重受损' -F 'injuredPerson={"name":"李测试","gender":"男","age":20,"phone":"13800009999","idNumber":"110101200601011234","address":"测试市测试路1号","medicalNote":"青霉素过敏"}' > /dev/null
SEV=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $T_AD" | python3 -c "import json,sys;print(json.load(sys.stdin)['severity'])")
check HIGH "$SEV" "评估判高风险后事件自动升级"
# 处置记录
curl -s -X POST $BASE/incidents/$RACE_ID/treat -H "Authorization: Bearer $WIN_TOKEN" -F 'content=制动夹板固定患肢，冰敷，镇痛，持续监测生命体征' > /dev/null
# 联系家属 + 模拟短信
curl -s -X POST $BASE/incidents/$RACE_ID/family -H "Authorization: Bearer $WIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"contactName":"李父","relation":"父亲","phone":"13900000000","content":"已电话告知伤情，家属正赶来","sendSms":true,"smsContent":"【体育中心】您家属受伤已处置，将转市中心医院"}' > /tmp/fam.json
check true "$(python3 -c "import json;print(bool(json.load(open('/tmp/fam.json'))['smsReceipt']))" | lower)" "家属短信模拟回执已生成"
# 换班交接给 medic2（若获胜者就是 medic2，则交给 medic3）
if [ "$WINNER_NUM" = "2" ]; then HO_ID=$ID_M3; HO_NAME="孙急救"; else HO_ID=$ID_M2; HO_NAME="赵急救"; fi
curl -s -X POST $BASE/incidents/$RACE_ID/handoff -H "Authorization: Bearer $WIN_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"toUserId\":$HO_ID,\"content\":\"跟腱疑似断裂，已固定，准备转院，注意末梢血运\"}" > /tmp/ho.json
grep -q '"ok":true' /tmp/ho.json || { echo "  换班响应: $(cat /tmp/ho.json)"; }
NEW_HANDLER=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $T_AD" | python3 -c "import json,sys;print(json.load(sys.stdin)['currentHandler']['name'])")
check "$HO_NAME" "$NEW_HANDLER" "换班后处置人更新，记录沿原事件保留"
# 换班对象的令牌（由 medic 编号映射）
if [ "$HO_ID" = "$ID_M3" ]; then HO_TOKEN=$T_M3; else HO_TOKEN=$T_M2; fi
# 转院：120 派车 + 医院接收回执
curl -s -X POST $BASE/incidents/$RACE_ID/hospital -H "Authorization: Bearer $HO_TOKEN" -H 'Content-Type: application/json' \
  -d '{"hospital":"市中心医院急诊","requestAmbulance":true,"transportBy":"AMBULANCE","callbackPhone":"13800000002","content":"途中生命体征平稳"}' > /tmp/hosp.json
check true "$(python3 -c "import json;r=json.load(open('/tmp/hosp.json'))['receipts'];print(bool(r.get('ambulance',{}).get('dispatchNo') and r.get('receive',{}).get('receiptNo')))" | lower)" "120派车单与医院接收回执齐全"
# 更正处置记录（保留原文）
TREAT_EV=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $HO_TOKEN" | python3 -c "
import json,sys
for e in json.load(sys.stdin)['timeline']:
    if e['type']=='TREAT': print(e['id']); break")
curl -s -X POST $BASE/incidents/$RACE_ID/correct -H "Authorization: Bearer $WIN_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"eventId\":$TREAT_EV,\"newContent\":\"制动夹板固定患肢，冰敷20分钟，未用药，持续监测生命体征\",\"reason\":\"用药记录有误，实际未给药\"}" > /dev/null
HAS_CORRECTION=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $T_AD" | python3 -c "
import json,sys
ts=json.load(sys.stdin)['timeline']
corr=[e for e in ts if e['type']=='CORRECTION']
print(bool(corr and corr[0]['correctedFrom'] and '镇痛' in corr[0]['correctedFrom']['content']))" | lower)
check true "$HAS_CORRECTION" "更正后原文（含划线内容）完整保留"

echo; echo "=== 场景4：高风险前台不能关闭 ==="
check 403 "$(code x $T_DUTY -X POST $BASE/incidents/$RACE_ID/false-alarm -H 'Content-Type: application/json' -d '{"reason":"测试误报"}')" "前台关闭高风险事件被拒绝(403)"
check 403 "$(code x $T_DUTY -X POST $BASE/incidents/$RACE_ID/close -H 'Content-Type: application/json' -d '{"reason":"收尾"}')" "前台调用结案被拒绝(403，仅管理员)"
check 201 "$(code x $T_AD -X POST $BASE/incidents/$RACE_ID/close -H 'Content-Type: application/json' -d '{"reason":"复盘完成：响应及时，转院顺利，流程合规"}')" "管理员复盘后结案成功(201)"
# 已结案不能再追加记录
check 409 "$(code x $HO_TOKEN -X POST $BASE/incidents/$RACE_ID/treat -F 'content=x')" "已结案事件拒绝追加处置(409)"

echo; echo "=== 场景5：PII 查看权限 ==="
# 非参与者 medic：取决于谁没参与。获胜者与换班对象之外的人才是非参与者
for M in 1 2 3; do
  TOK="T_M$M"; TOK=${!TOK}
  PARTIC=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $TOK" | python3 -c "import json,sys;print(json.load(sys.stdin)['isParticipant'])")
  echo "  medic$M isParticipant=$PARTIC"
done
# 找一个确定的非参与者（既不是获胜者也不是换班接手人的 medic 编号）
NON_NUM=1
for N in 1 2 3; do
  if [ "$N" != "$WINNER_NUM" ]; then
    if { [ "$N" = "2" ] && [ "$HO_ID" != "$ID_M2" ]; } || { [ "$N" = "3" ] && [ "$HO_ID" != "$ID_M3" ]; } || { [ "$N" = "1" ]; }; then
      # medic1 不可能是换班对象（脚本只在 medic2/medic3 间选）
      NON_NUM=$N; break
    fi
  fi
done
NONTOK_VAR=T_M$NON_NUM; NONTOK=${!NONTOK_VAR}
MASKED=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $NONTOK" | python3 -c "import json,sys;p=json.load(sys.stdin)['injuredPerson'];print(p['piiLocked'], '*' in (p['name'] or ''))" | tr 'A-Z' 'a-z')
check "true true" "$MASKED" "非参与者(medic$NON_NUM)看到锁定+脱敏的伤者资料"
check 403 "$(code x $NONTOK "$BASE/incidents/$RACE_ID?fullPii=1")" "非参与者申请完整 PII 被拒绝(403)"
FULL_HO=$(curl -s "$BASE/incidents/$RACE_ID?fullPii=1" -H "Authorization: Bearer $HO_TOKEN" | python3 -c "import json,sys;p=json.load(sys.stdin)['injuredPerson'];print(p['name'],p['medicalNote'])")
check "李测试 青霉素过敏" "$FULL_HO" "换班接手人（参与者）可查看完整 PII"
FULL_AD=$(curl -s "$BASE/incidents/$RACE_ID?fullPii=1" -H "Authorization: Bearer $T_AD" | python3 -c "import json,sys;print(json.load(sys.stdin)['injuredPerson']['name'])")
check "李测试" "$FULL_AD" "管理员可查看完整 PII"

echo; echo "=== 场景6：误报（无人接手，前台可直接标记）与重复报警 ==="
curl -s -X POST $BASE/incidents -H "Authorization: Bearer $T_DUTY" -H 'Content-Type: application/json' \
  -d '{"location":"测试-误报点","occurredAt":"2026-10-04T09:20","victimBrief":"称有人晕倒"}' > /tmp/fa.json
FA_ID=$(python3 -c "import json;print(json.load(open('/tmp/fa.json'))['id'])")
check 201 "$(code x $T_DUTY -X POST $BASE/incidents/$FA_ID/false-alarm -H 'Content-Type: application/json' -d '{"reason":"到场核实为蹲下系鞋带，非受伤"}')" "无人接手的普通求助，前台可标记误报"
# 高风险误报：先建单，急救员接单后评估升级，再试前台关闭 → 403，管理员关闭
curl -s -X POST $BASE/incidents -H "Authorization: Bearer $T_DUTY" -H 'Content-Type: application/json' \
  -d '{"location":"测试-高风险误报争议","occurredAt":"2026-10-04T09:30","victimBrief":"称头部受撞击"}' > /tmp/hf.json
HF_ID=$(python3 -c "import json;print(json.load(open('/tmp/hf.json'))['id'])")
curl -s -X POST $BASE/incidents/$HF_ID/accept -H "Authorization: Bearer $T_M3" > /dev/null
curl -s -X POST $BASE/incidents/$HF_ID/escalate -H "Authorization: Bearer $T_M3" -H 'Content-Type: application/json' -d '{"reason":"头部外伤，需观察"}' > /dev/null
check 403 "$(code x $T_DUTY -X POST $BASE/incidents/$HF_ID/false-alarm -H 'Content-Type: application/json' -d '{"reason":"虚惊"}')" "已接手高风险事件，前台不能关闭(403)"
check 201 "$(code x $T_AD -X POST $BASE/incidents/$HF_ID/false-alarm -H 'Content-Type: application/json' -d '{"reason":"管理员核实为夸大描述，无实际伤情"}')" "管理员确认后可按误报关闭"
# 重复报警：新建一单，由值班员关联到既有事件
curl -s -X POST $BASE/incidents -H "Authorization: Bearer $T_DUTY" -H 'Content-Type: application/json' \
  -d '{"location":"测试-羽毛球场","occurredAt":"2026-10-04T09:40","victimBrief":"同一伤者再次来电催促"}' > /tmp/dup.json
DUP_ID=$(python3 -c "import json;print(json.load(open('/tmp/dup.json'))['id'])")
check 201 "$(code x $T_DUTY -X POST $BASE/incidents/$DUP_ID/duplicate -H 'Content-Type: application/json' -d "{\"duplicateCode\":\"$RACE_CODE\",\"reason\":\"同一伤者同一事件的催促电话\"}")" "重复报警沿原事件关联"
DUP_STATUS=$(curl -s $BASE/incidents/$DUP_ID -H "Authorization: Bearer $T_DUTY" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['status'],d['duplicateOf']['code'])")
check "DUPLICATE $RACE_CODE" "$DUP_STATUS" "重复单状态=DUPLICATE 且指向原事件"
ORIG_HAS_NOTE=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $T_DUTY" | python3 -c "import json,sys;print(any(e['type']=='DUPLICATE' for e in json.load(sys.stdin)['timeline']))" | lower)
check true "$ORIG_HAS_NOTE" "原事件时间线也保留了合并记录"

echo; echo "=== 场景7：最终时间线完整性 ==="
TL=$(curl -s $BASE/incidents/$RACE_ID -H "Authorization: Bearer $T_AD" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(' → '.join(e['typeLabel'] for e in d['timeline']))")
echo "  $TL"
python3 - <<PY
import json,urllib.request
req=urllib.request.Request('$BASE/incidents/$RACE_ID',headers={'Authorization':'Bearer $T_AD'})
d=json.load(urllib.request.urlopen(req))
types=[e['type'] for e in d['timeline']]
need=['CREATE','ACCEPT','ASSESS','TREAT','FAMILY','TRANSFER_HANDOFF','AMBULANCE','HOSPITAL','CORRECTION','ESCALATE','CLOSE','DUPLICATE']
missing=[t for t in need if t not in types]
print('  ✅ 完整时间线包含全部关键节点' if not missing else '  ❌ 缺少: '+str(missing))
counts = (len(types), len(d['mockLogs']), len(d['notifications']), len(d['attachments']))
print('  时间线 %d 条记录，机构回执 %d 份，通知 %d 条，附件 %d 个' % counts)
PY

echo; echo "结果：$PASS 通过 / $FAIL 失败"
exit $FAIL
