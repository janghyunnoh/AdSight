import asyncio
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.main import app


class AITests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env = patch.dict(os.environ, {"LARK_APP_ID": "test", "LARK_APP_SECRET": "test-secret", "ADSIGHT_NOTES_DB": directory.name + "/notes.sqlite3", "NVIDIA_API_KEY": "private-ai-key", "NVIDIA_MODEL": "test-model"})
        env.start(); self.addCleanup(env.stop)
        self.body = {"provider": "nvidia", "columns": [{"index": 0, "name": "Unknown", "samples": ["$100", "$200"], "numeric": True, "dates": False}]}
        self.result = {"summary": "비용을 포함한 광고 데이터로 추정됩니다.", "columns": [{"index": 0, "label": "비용", "description": "비용 값입니다. 총액인지 단가인지 확인이 필요합니다.", "rationale": "달러 표시 샘플이 있지만 비용 기준은 알 수 없습니다.", "role": "metric", "aggregation": "mean", "priority": 4, "confidence": "low", "question": "총비용인가요?"}]}

    def mock(self, client, handler):
        original = app.state.ai.http
        app.state.ai.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.addCleanup(lambda: asyncio.run(original.aclose()))

    def test_interpret_nvidia_and_secret_redaction(self):
        seen = []
        def upstream(request):
            seen.append(request)
            payload = json.loads(request.content)
            self.assertEqual(payload["stream"], False)
            self.assertEqual(request.headers["Authorization"], "Bearer private-ai-key")
            return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(self.result)}, "finish_reason": "stop"}]})
        with TestClient(app) as client:
            self.mock(client, upstream)
            self.assertNotIn("private-ai-key", client.get("/api/ai/providers").text)
            for provider in ("nvidia",):
                response = client.post("/api/ai/interpret", json={**self.body, "provider": provider})
                self.assertEqual(response.status_code, 200)
                self.assertNotIn("meaning", response.json()["columns"][0])
                self.assertNotIn("private-ai-key", response.text)
            self.assertEqual(len(seen), 1)

    def test_upstream_errors_no_retry_or_fallback(self):
        for status, expected in [(429, 429), (401, 502), (403, 502), (404, 503), (500, 502)]:
            calls = []
            with TestClient(app) as client:
                self.mock(client, lambda request: (calls.append(request), httpx.Response(status, json={"detail": "private-ai-key"}))[1])
                response = client.post("/api/ai/interpret", json=self.body)
                self.assertEqual(response.status_code, expected)
                self.assertEqual(len(calls), 1)
                self.assertNotIn("private-ai-key", response.text)
                if status == 429: self.assertEqual(response.headers["retry-after"], "30")

    def test_invalid_output_and_input_not_applied(self):
        with TestClient(app) as client:
            self.mock(client, lambda request: httpx.Response(200, json={"choices": [{"message": {"content": "not JSON"}}]}))
            self.assertEqual(client.post("/api/ai/interpret", json=self.body).status_code, 502)
            self.assertEqual(client.post("/api/ai/interpret", json={**self.body, "provider": "paid-service"}).status_code, 422)
            self.assertEqual(client.post("/api/ai/interpret", json={**self.body, "columns": [{"index": 1, "name": "bad", "samples": []}]}).status_code, 422)

    def test_duplicate_column_and_truncated_output(self):
        for content, finish in [(json.dumps({**self.result, "columns": self.result["columns"] * 2}), "stop"), (json.dumps(self.result), "length")]:
            with TestClient(app) as client:
                self.mock(client, lambda request: httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": finish}]}))
                self.assertEqual(client.post("/api/ai/interpret", json=self.body).status_code, 502)

    def test_parallel_requests_not_queued(self):
        with TestClient(app) as client:
            app.state.ai.lock = type("Busy", (), {"locked": lambda self: True})()
            response = client.post("/api/ai/interpret", json=self.body)
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "5")

    def test_removed_provider_rejected(self):
        with TestClient(app) as client:
            self.assertNotIn('ollama', client.get('/api/ai/providers').text)
            self.assertEqual(client.post('/api/ai/check', json={'provider': 'ollama'}).status_code, 422)
            self.assertEqual(client.post('/api/ai/interpret', json={**self.body, 'provider': 'ollama'}).status_code, 422)

    def test_finding_explanation_uses_bounded_evidence_and_separate_schema(self):
        body={'provider':'nvidia','finding':{'kind':'change','title':'클릭수 증가','detail':'동일 길이 기간 대비 합계 변화',
              'metric':'클릭수','metric_description':'클릭 횟수','before':100,'after':150,'change_pct':50,
              'aggregation':'sum','current_samples':7,'previous_samples':7},
              'period':{'start':'2026-10-08','end':'2026-10-14','previousStart':'2026-10-01','previousEnd':'2026-10-07','currentRows':7,'previousRows':7},
              'scope':'전체 대상','dataset_summary':'광고 성과 데이터','threshold':30}
        body['context']={'related_metrics':[],'group_by':'회사','group_count':2,
            'groups':[{'name':'A','before':50,'after':100,'current_samples':7,'previous_samples':7}],
            'daily':{'current':[{'date':'2026-10-08','value':20,'samples':1}], 'previous':[], 'current_days':7,'previous_days':7}}
        result={'interpretation':'클릭수가 이전 기간보다 증가했습니다. 원인은 확인이 필요합니다.',
                'limitations':['기간별 광고 노출량은 주어지지 않았습니다.'],'next_checks':['대상별 클릭수 변화를 확인하세요.']}
        def upstream(request):
            payload=json.loads(request.content)
            self.assertEqual(payload['response_format']['json_schema']['name'],'finding_explanation')
            self.assertEqual(payload['max_tokens'],2048)
            evidence=json.loads(payload['messages'][1]['content'])
            self.assertEqual(evidence['finding']['before'],100)
            self.assertEqual(evidence['context']['daily']['current'][0]['value'],20)
            self.assertEqual(evidence['context']['group_count'],2)
            self.assertNotIn('rows',evidence)
            self.assertNotIn('samples',evidence)
            return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(result)},'finish_reason':'stop'}]})
        with TestClient(app) as client:
            self.mock(client,upstream)
            response=client.post('/api/ai/explain-finding',json=body)
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json(),result)
            self.assertEqual(client.post('/api/ai/explain-finding',json={**body,'scope':'x'*601}).status_code,422)
        with TestClient(app) as client:
            self.mock(client,lambda request:httpx.Response(429,json={}))
            self.assertEqual(client.post('/api/ai/explain-finding',json=body).status_code,429)
        with TestClient(app) as client:
            self.mock(client,lambda request:httpx.Response(200,json={'choices':[{'message':{'content':'{}'},'finish_reason':'stop'}]}))
            self.assertEqual(client.post('/api/ai/explain-finding',json=body).status_code,502)

    def test_timeout(self):
        def timeout(request): raise httpx.ReadTimeout("private-ai-key")
        with TestClient(app) as client:
            self.mock(client, timeout)
            response = client.post("/api/ai/interpret", json=self.body)
            self.assertEqual(response.status_code, 504)
            self.assertNotIn("private-ai-key", response.text)

    def test_reported_usage_persists_and_missing_usage_is_unknown(self):
        with TestClient(app) as client:
            self.assertIsNone(client.get('/api/ai/usage').json()['observed_tokens'])
            self.mock(client, lambda request: httpx.Response(200, json={
                'usage': {'prompt_tokens': 100, 'completion_tokens': 25, 'total_tokens': 125},
                'choices': [{'message': {'content': 'OK'}, 'finish_reason': 'stop'}]}))
            asyncio.run(app.state.ai.generate('nvidia', []))
            usage = client.get('/api/ai/usage').json()
            self.assertEqual(usage['observed_tokens'], 125)
            self.assertEqual(usage['reported_requests'], 1)
            self.assertIsNone(usage['remaining_tokens'])
            self.assertNotIn('private-ai-key', json.dumps(usage))
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/ai/usage').json()['observed_tokens'], 125)
            self.mock(client, lambda request: httpx.Response(200, json={
                'choices': [{'message': {'content': 'OK'}, 'finish_reason': 'stop'}]}))
            asyncio.run(app.state.ai.generate('nvidia', []))
            self.assertEqual(client.get('/api/ai/usage').json()['reported_requests'], 1)

    def test_english_prose_is_not_applied(self):
        result = {**self.result, "summary": "This dataset contains campaign metrics."}
        with TestClient(app) as client:
            seen = []
            def upstream(request):
                seen.append(json.loads(request.content))
                return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(result)}, "finish_reason": "stop"}]})
            self.mock(client, upstream)
            response = client.post('/api/ai/interpret', json=self.body)
            self.assertEqual(response.status_code, 502)
            self.assertIn('한국어', response.json()['detail'])
            self.assertEqual(len(seen), 1)
            self.assertIn('반드시', seen[0]['messages'][0]['content'])
