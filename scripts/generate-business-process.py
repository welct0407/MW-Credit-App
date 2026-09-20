"""Generate the maintained editable daily cash statement process diagram."""
from pathlib import Path
import xml.etree.ElementTree as E

ROOT=Path(__file__).resolve().parents[1]
file=E.Element('mxfile',host='app.diagrams.net',type='device',version='24.7.17')
diagram=E.SubElement(file,'diagram',id='cash-statement',name='Daily cash statement')
model=E.SubElement(diagram,'mxGraphModel',dx='1500',dy='1200',grid='1',gridSize='10',guides='1',
                   tooltips='1',connect='1',arrows='1',fold='1',page='1',pageScale='1',
                   pageWidth='1500',pageHeight='1400',math='0',shadow='0')
root=E.SubElement(model,'root'); E.SubElement(root,'mxCell',id='0'); E.SubElement(root,'mxCell',id='1',parent='0')

def node(key,label,x,y,w=280,h=90,kind='process'):
    colors={'process':('#fce4ec','#d81b60'),'decision':('#fff3e0','#ef6c00'),
            'data':('#e8eaf6','#5c6bc0'),'success':('#e8f5e9','#2e7d32'),
            'stop':('#ffebee','#c62828'),'note':('#fafafa','#78909c')}
    fill,stroke=colors[kind]; shape='rhombus;' if kind=='decision' else 'rounded=1;arcSize=12;'
    c=E.SubElement(root,'mxCell',id=key,value=label,style=f'{shape}whiteSpace=wrap;html=0;fillColor={fill};strokeColor={stroke};strokeWidth=2;fontColor=#263238;fontSize=15;align=center;verticalAlign=middle;spacing=10;',vertex='1',parent='1')
    E.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})

def edge(a,b,label='',points=None):
    c=E.SubElement(root,'mxCell',id='e'+str(len(root)),value=label,style='edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;endArrow=block;endFill=1;strokeColor=#546e7a;fontColor=#37474f;fontSize=13;labelBackgroundColor=#ffffff;',edge='1',parent='1',source=a,target=b)
    g=E.SubElement(c,'mxGeometry',relative='1',**{'as':'geometry'})
    if points:
        arr=E.SubElement(g,'Array',**{'as':'points'})
        for x,y in points:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))

node('title','DAILY CASH STATEMENT  |  Production delivery process',60,30,1380,60,'note')
node('timer','00:15 Asia/Bangkok\nsystemd timer',610,130,280,80)
node('period','Select latest completed day\n00:00–00:00 Bangkok',610,250,280,80)
node('snapshot','Read R010 cash effects and balances\nRepeatable-read, read-only PostgreSQL\nFreeze one private snapshot',560,370,380,110,'data')
node('render','Render every bank account in English and Thai\nLogo-only design · whole baht · HH:MM',560,520,380,90)
node('partner','Next Partner with\nIG Integration Enabled = TRUE?',610,650,280,110,'decision')
node('skip','Disabled Partner\nNo delivery',90,655,250,80,'stop')
node('prefs','Recheck unique IG identity, preferred language\nand current Partner email',560,800,380,90,'data')
node('ig','IG route and 24-hour window available?\nSend each statement image once',560,930,380,110,'decision')
node('igd','All images accepted by Meta\nRecord provider message IDs',1000,945,320,80,'success')
node('email','Fallback: send complete statement set\nto current Partner Email through Graph',120,930,330,100,'process')
node('eo','Email result?',145,1080,280,90,'decision')
node('ea','ACCEPTED\nStop',20,1220,200,70,'success')
node('er','Definitely unsent\nRetry with bounded backoff\nMaximum 3 attempts',250,1210,240,90,'process')
node('eu','Unknown / interrupted\nRetain evidence; never replay',520,1210,250,90,'stop')
node('journal','Durable journals + private snapshot\nserialize runs, prevent duplicates, preserve uncertainty',900,1190,460,100,'note')
edge('timer','period'); edge('period','snapshot'); edge('snapshot','render'); edge('render','partner')
edge('partner','skip','No'); edge('partner','prefs','Yes'); edge('prefs','ig')
edge('ig','igd','Yes'); edge('ig','email','No / partial / unknown',[(500,985),(500,980)])
edge('email','eo'); edge('eo','ea','Accepted'); edge('eo','er','Rejected'); edge('eo','eu','Unknown')
edge('er','email','Retry timer',[(370,1170),(70,1170),(70,980)])
edge('igd','partner','Next Partner',[(1360,985),(1360,705)])
edge('ea','partner','Next Partner',[(40,750),(500,750)])

E.indent(file,space='  ')
out=ROOT/'docs'/'BUSINESS_PROCESS.drawio'
E.ElementTree(file).write(out,encoding='utf-8',xml_declaration=True)
ids={c.get('id') for c in root}
assert len(ids)==len(root)
for c in root:
    if c.get('edge')=='1': assert c.get('source') in ids and c.get('target') in ids
print(f'Created {out}; XML IDs and edge references verified.')
