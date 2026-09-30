import collections
import json
from pathlib import Path

target = Path('_exp/model_opt/results.jsonl')
rows = [json.loads(line) for line in target.read_text(encoding='utf-8').splitlines() if line.strip()]
counts = collections.Counter((r['round'], r['group']) for r in rows)
dups = {k: v for k, v in counts.items() if v > 1}

latest = {}
for record in rows:
    latest[(record['round'], record['group'])] = record
dedup = [latest[key] for key in sorted(latest)]
target.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in dedup) + '\n', encoding='utf-8')

print('原始 %d 行 → 去重后 %d 组（重复组 %d 个）' % (len(rows), len(dedup), len(dups)))

flat = [(r['round'], r['group'], p['property'], p['test_rmse'], p['test_r2'])
        for r in dedup for p in (r.get('properties') or []) if p.get('status') == 'ok']
best = {}
for round_no, group_no, prop, rmse, r2 in flat:
    if prop not in best or rmse < best[prop][3]:
        best[prop] = (round_no, group_no, prop, rmse, r2)
for prop, (round_no, group_no, _p, rmse, r2) in sorted(best.items()):
    print('  最优 %-18s R%dG%d  test_rmse=%.4f  R2=%.3f' % (prop, round_no, group_no, rmse, r2))
errors = ['R%dG%d' % (r['round'], r['group']) for r in dedup if r.get('error')]
print('  失败组:', errors or '无')
