import os
import tempfile
import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app
from app.settings import read


class SettingsTests(unittest.TestCase):
    def test_approved_configuration_survives_restart_and_aliases(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            'ADSIGHT_NOTES_DB': directory+'/notes.sqlite3', 'LARK_APP_ID':'test', 'LARK_APP_SECRET':'test'
        }):
            body={'source':'wiki-link', 'sheet_id':'sheet1', 'columns':['Cost'],
                  'settings':[{'role':'metric','aggregation':'sum','label':'광고 집행액','unit':'USD'}],
                  'interpretation':{'summary':'비용 데이터','provider':'nvidia','model':'test'}}
            with TestClient(app) as client:
                app.state.lark.resolve_source=AsyncMock(return_value='canonicalSpreadsheet')
                self.assertEqual(client.post('/api/settings',json=body).status_code,200)
                saved=read(app.state.notes,'canonicalSpreadsheet','sheet1')
                self.assertEqual(saved['settings'][0]['label'],'광고 집행액')
                self.assertIsNone(read(app.state.notes,'differentSpreadsheet','sheet1'))
                self.assertIsNone(read(app.state.notes,'canonicalSpreadsheet','sheet2'))
                # Reanalysis drafts have no write endpoint; unacknowledged uncertainty cannot replace approval.
                body['settings'][0].update(confidence='medium',question='총액인가요?',reviewAcknowledged=False)
                self.assertEqual(client.post('/api/settings',json=body).status_code,422)
                self.assertEqual(read(app.state.notes,'canonicalSpreadsheet','sheet1'),saved)
            with TestClient(app) as client:
                app.state.lark.resolve_source=AsyncMock(return_value='canonicalSpreadsheet')
                app.state.lark.table=AsyncMock(return_value={'columns':['Cost'],'rows':[['$10'],['$20']], 'sheet':{'id':'sheet1'}})
                data=client.post('/api/source/sheets/sheet1',json={'source':'direct-sheet-link'}).json()
                self.assertEqual(data['document_id'],'canonicalSpreadsheet')
                self.assertEqual(len(data['rows']),2)
                self.assertEqual(data['approved_settings'],saved)

    def test_dashboard_layout_is_separate_and_durable(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            'ADSIGHT_NOTES_DB':directory+'/notes.sqlite3','LARK_APP_ID':'test','LARK_APP_SECRET':'test'
        }):
            with TestClient(app) as client:
                app.state.lark.resolve_source=AsyncMock(return_value='doc')
                client.post('/api/settings',json={'source':'doc','sheet_id':'sheet','columns':['Date','Cost','Clicks'],
                    'settings':[{'role':'date','aggregation':'mean'},{'role':'metric','aggregation':'sum'},{'role':'metric','aggregation':'sum'}]})
                layout={'columns':['Clicks','Date','Cost'],'cards':[2],'selected_metric':2,'comparison_metrics':[0,2]}
                payload={'source':'doc','sheet_id':'sheet','dashboard':layout}
                self.assertEqual(client.patch('/api/settings/dashboard',json=payload).status_code,200)
                saved=read(app.state.notes,'doc','sheet')
                self.assertEqual(saved['dashboard'],layout)
                self.assertEqual(saved['columns'],['Date','Cost','Clicks'])
                for bad in [dict(layout,cards=[1],selected_metric=1),dict(layout,cards=[0],selected_metric=2),dict(layout,columns=['renamed','Date','Cost'])]:
                    self.assertIn(client.patch('/api/settings/dashboard',json={**payload,'dashboard':bad}).status_code,[409,422])
                self.assertEqual(read(app.state.notes,'doc','sheet')['dashboard'],layout)
            with TestClient(app):
                self.assertEqual(read(app.state.notes,'doc','sheet')['dashboard'],layout)
