"""Local synthetic preview only: http://127.0.0.1:8766/#key=demo (add &detail=32:382 for the proposed dashboard links)"""
import hashlib
from wsgiref.simple_server import make_server, WSGIRequestHandler
from app import ChartApp

rows=[]
for category,x,ys in [('Star',4,[60,70,85,91]),('Question Mark',75,[51,59,66,80,95]),
                       ('Cash Cow',2,[1,2,3,4,6,10,20,30]),('Dog',75,[2,3,4,6,20,35])]:
    for i,y in enumerate(ys):
        rows.append(dict(borrower_id=f'{category}-{i}',name=f'Demo {category} {i+1}',category=category,
                         plot_status='Plotted',plot_x=x,plot_y=y,payment_score=92,relative_contribution=1.2,
                         contribution_30d=2000,outstanding_principal=10000,confidence='Established',
                         arrangement_status='Standard schedule',reporting_date='2026-09-25',
                         position_basis='Measured score',classification_reason='Synthetic preview.'))
rows.append(dict(rows[0],borrower_id='Unplotted-0',name='Demo Unplotted 1',plot_status='Unavailable',plot_x=None,plot_y=None))
app=ChartApp({'secret_sha256':hashlib.sha256(b'demo').hexdigest()},lambda:rows)
class Quiet(WSGIRequestHandler):
    def log_message(self,*args): pass
if __name__=='__main__':
    with make_server('127.0.0.1',8766,app,handler_class=Quiet) as server: server.serve_forever()
