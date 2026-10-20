"""One real-sheet interpretation per provider; no system metrics or timing benchmark.
Results are kept in ignored data/column-reviews. Credentials are never saved.
"""
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import time
from fastapi import HTTPException
from app.ai import AIClient, InterpretRequest
from app.lark import LarkClient

ROOT = Path(__file__).resolve().parent.parent

async def main():
    path = ROOT / 'data' / 'column-reviews' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path.mkdir(parents=True, exist_ok=True)
    lark = LarkClient()
    try:
        sheets = await lark.sheets()
        data = await lark.table(sheets[0]['id'])
    finally:
        await lark.http.aclose()
    # The same client-side flags and identical examples go to both providers.
    code = """const D=require('./app/static/data-utils.js');let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);const columns=d.columns.map((name,index)=>{const values=d.rows.map(r=>r[index]);const numbers=values.map(D.number).filter(v=>v!==null);return {index,name,samples:D.columnSamples(d.rows,index),unit:D.metricType(d.rows,index).unit,numeric:numbers.length>0,dates:values.some(v=>D.date(v)!==null),stats:{nonempty:values.filter(v=>v!==null&&v!=='').length,distinct:new Set(values.map(D.text)).size,numeric_count:numbers.length,min:numbers.length?Math.min(...numbers):null,max:numbers.length?Math.max(...numbers):null,date_count:values.filter(v=>D.date(v)!==null).length}}});console.log(JSON.stringify(columns));});"""
    columns = json.loads(subprocess.check_output(['node', '-e', code], input=json.dumps(data), text=True, cwd=ROOT))
    payload = [{k:v for k,v in column.items() if k != 'stats'} for column in columns]
    report = {'row_count': len(data['rows']), 'columns': columns, 'results': {}, 'method': 'Identical random samples of up to ten distinct nonempty values and format flags. Full-column statistics used for reviewer assessment only, not sent to models. No authoritative data dictionary supplied.'}
    output = path / 'results.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    client = AIClient()
    try:
        for provider in ('nvidia',):
            print('START', provider, 'columns', len(columns), flush=True)
            start = time.monotonic()
            try:
                result = await client.interpret(InterpretRequest(provider=provider, columns=payload))
                report['results'][provider] = {'ok': True, 'seconds': round(time.monotonic()-start,1), 'interpretation': result}
                print('PASS', provider, 'column interpretations', len(result['columns']), flush=True)
            except HTTPException as error:
                report['results'][provider] = {'ok': False, 'status': error.status_code, 'detail': error.detail}
                print('FAIL', provider, error.status_code, error.detail, flush=True)
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        await client.http.aclose()
    print('REPORT', output, flush=True)

if __name__ == '__main__':
    asyncio.run(main())
